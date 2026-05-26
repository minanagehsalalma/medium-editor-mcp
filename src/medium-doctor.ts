import * as fs from 'fs';
import MediumGraphqlClient from './medium-graphql';
import { inspectMediumSessionConfig } from './medium-session';
import { buildMediumSessionSetupGuide } from './medium-session-setup';

interface DoctorCheck {
  code: string;
  message: string;
  passed: boolean;
  severity: 'info' | 'warning';
}

interface DoctorWorkflowReadiness {
  missingAliases: string[];
  ready: boolean;
  workflow: string;
}

const requiredAliasesByWorkflow: Record<string, string[]> = {
  optimize_post: ['stage-update-post-metadata', 'set-post-tags', 'set-post-seo-title', 'set-post-seo-description', 'update-canonical-url'],
  optimize_visibility: ['set-publishing-flow-defaults', 'post-allow-responses', 'create-post-share-key'],
  settings_read: ['post-settings', 'post-published-dialog']
};

function buildWorkflowReadiness(registryAliases: string[]): DoctorWorkflowReadiness[] {
  return Object.entries(requiredAliasesByWorkflow).map(([workflow, aliases]) => {
    const missingAliases = aliases.filter((alias) => !registryAliases.includes(alias));
    return {
      workflow,
      missingAliases,
      ready: missingAliases.length === 0
    };
  });
}

class MediumDoctor {
  constructor(private graphqlClient: MediumGraphqlClient) {}

  public async run() {
    const sessionInspection = inspectMediumSessionConfig();
    const runtime = this.graphqlClient.inspectRuntime();
    const checks: DoctorCheck[] = [];

    checks.push({
      code: 'session_source_configured',
      passed: sessionInspection.availableSources.length > 0,
      severity: sessionInspection.availableSources.length > 0 ? 'info' : 'warning',
      message: sessionInspection.availableSources.length > 0
        ? `Detected session source(s): ${sessionInspection.availableSources.join(', ')}.`
        : 'No Medium session source is configured.'
    });

    checks.push({
      code: 'session_loadable',
      passed: !sessionInspection.loadError,
      severity: sessionInspection.loadError ? 'warning' : 'info',
      message: sessionInspection.loadError || 'Medium session cookies loaded successfully.'
    });

    checks.push({
      code: 'transport_ready',
      passed: runtime.transport !== 'cycletls' || fs.existsSync(runtime.cycleTlsScript),
      severity: runtime.transport === 'cycletls' && !fs.existsSync(runtime.cycleTlsScript) ? 'warning' : 'info',
      message: runtime.transport === 'cycletls'
        ? (fs.existsSync(runtime.cycleTlsScript)
          ? `CycleTLS transport is active at ${runtime.cycleTlsScript}.`
          : `CycleTLS transport is selected but the script was not found at ${runtime.cycleTlsScript}.`)
        : 'Axios transport is active.'
    });

    checks.push({
      code: 'operations_registry_present',
      passed: Boolean(runtime.registryPath && fs.existsSync(runtime.registryPath)),
      severity: runtime.registryPath && fs.existsSync(runtime.registryPath) ? 'info' : 'warning',
      message: runtime.registryPath && fs.existsSync(runtime.registryPath)
        ? `Medium operations registry found at ${runtime.registryPath}.`
        : 'No medium-operations.json registry file is available yet.'
    });

    const workflowReadiness = buildWorkflowReadiness(runtime.registryAliases);
    workflowReadiness.forEach((workflow) => {
      checks.push({
        code: `workflow_${workflow.workflow}`,
        passed: workflow.ready,
        severity: workflow.ready ? 'info' : 'warning',
        message: workflow.ready
          ? `${workflow.workflow} has the required registered GraphQL aliases.`
          : `${workflow.workflow} is missing aliases: ${workflow.missingAliases.join(', ')}.`
      });
    });

    const probe = sessionInspection.loadError
      ? null
      : await this.graphqlClient.probeSession().catch((error: any) => ({
          authenticated: false,
          location: null,
          status: 0,
          url: 'https://medium.com/me/stories/drafts',
          error: error.message
        }));

    checks.push({
      code: 'session_probe',
      passed: Boolean(probe && (probe as any).authenticated),
      severity: probe && (probe as any).authenticated ? 'info' : 'warning',
      message: probe
        ? ((probe as any).authenticated
          ? `Probe succeeded with HTTP ${(probe as any).status}.`
          : `Probe failed or did not authenticate${(probe as any).error ? `: ${(probe as any).error}` : ` (HTTP ${(probe as any).status}).`}`)
        : 'Probe was skipped because the session could not be loaded.'
    });

    const passedCount = checks.filter((check) => check.passed).length;
    const summary = {
      overallReady: checks.every((check) => check.passed || check.severity === 'info') && Boolean(probe && (probe as any).authenticated),
      passedChecks: passedCount,
      totalChecks: checks.length
    };

    return {
      summary,
      checks,
      sessionInspection,
      graphqlRuntime: runtime,
      workflowReadiness,
      probe,
      setupGuide: buildMediumSessionSetupGuide()
    };
  }
}

export default MediumDoctor;
