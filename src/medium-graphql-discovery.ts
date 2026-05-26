import vm from 'vm';
import MediumGraphqlClient from './medium-graphql';

const GRAPHQL_URI_PATTERN = /window\.__GRAPHQL_URI__\s*=\s*"([^"]+)"/;
const LITE_BUNDLE_URL_PATTERN = /https:\/\/cdn-client\.medium\.com\/lite\/static\/js\/[^"'<>\\\s]+?\.js/g;
const OPERATION_PATTERN = /OperationDefinition",operation:"(query|mutation|subscription)",name:\{kind:"Name",value:"([^"]+)"/g;

export interface ExtractedGraphqlOperation {
  name: string;
  query: string;
  type: 'query' | 'mutation' | 'subscription';
}

export interface DiscoveredGraphqlBundle {
  operationCount: number;
  operations: ExtractedGraphqlOperation[];
  status: number;
  url: string;
}

export interface MediumGraphqlDiscoveryOptions {
  maxBundles?: number;
  operationName?: string;
  pageUrl?: string;
}

export interface MediumGraphqlDiscoveryResult {
  bundleUrls: string[];
  bundles: DiscoveredGraphqlBundle[];
  finalUrl: string;
  graphQlUri: string | null;
  operationFilter: string | null;
  pageUrl: string;
  status: number;
}

export interface MediumGraphqlRegistryOperationEntry {
  body: {
    operationName: string;
    query: string;
    variables: Record<string, unknown>;
  };
  endpoint: string;
  headers?: Record<string, string>;
  referer: string;
  source: string;
}

export interface MediumGraphqlRegistryDocument {
  operations: Record<string, MediumGraphqlRegistryOperationEntry>;
}

type GraphqlAstNode = any;

const unique = <T>(values: T[]) => [...new Set(values)];

const normalizeJsLiteral = (value: string) =>
  value
    .replace(/!0/g, 'true')
    .replace(/!1/g, 'false')
    .replace(/\bvoid 0\b/g, 'undefined');

const findBalancedObjectLiteral = (text: string, startIndex: number) => {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error('Unable to find the end of the embedded GraphQL document.');
};

const extractDocumentLiteralForOperation = (bundleText: string, operationName: string, startHint: number) => {
  const documentStart = bundleText.lastIndexOf('{kind:"Document"', startHint);
  if (documentStart === -1) {
    throw new Error(`Unable to locate the embedded GraphQL document for operation "${operationName}".`);
  }

  return findBalancedObjectLiteral(bundleText, documentStart);
};

const evaluateDocumentLiteral = (literal: string): GraphqlAstNode =>
  vm.runInNewContext(`(${normalizeJsLiteral(literal)})`);

const printDirectives = (directives?: GraphqlAstNode[]) => {
  if (!directives?.length) {
    return '';
  }

  return directives
    .map((directive) => {
      const args = directive.arguments?.length
        ? `(${directive.arguments.map((argument: GraphqlAstNode) => `${argument.name.value}: ${printValue(argument.value)}`).join(', ')})`
        : '';
      return ` @${directive.name.value}${args}`;
    })
    .join('');
};

const printType = (typeNode: GraphqlAstNode): string => {
  if (typeNode.kind === 'NamedType') {
    return typeNode.name.value;
  }

  if (typeNode.kind === 'NonNullType') {
    return `${printType(typeNode.type)}!`;
  }

  if (typeNode.kind === 'ListType') {
    return `[${printType(typeNode.type)}]`;
  }

  throw new Error(`Unsupported GraphQL type node: ${typeNode.kind}`);
};

const printValue = (valueNode: GraphqlAstNode): string => {
  switch (valueNode.kind) {
    case 'Variable':
      return `$${valueNode.name.value}`;
    case 'IntValue':
    case 'FloatValue':
    case 'EnumValue':
      return valueNode.value;
    case 'StringValue':
      return JSON.stringify(valueNode.value);
    case 'BooleanValue':
      return valueNode.value ? 'true' : 'false';
    case 'NullValue':
      return 'null';
    case 'ListValue':
      return `[${valueNode.values.map((item: GraphqlAstNode) => printValue(item)).join(', ')}]`;
    case 'ObjectValue':
      return `{ ${valueNode.fields.map((field: GraphqlAstNode) => `${field.name.value}: ${printValue(field.value)}`).join(', ')} }`;
    default:
      throw new Error(`Unsupported GraphQL value node: ${valueNode.kind}`);
  }
};

const printSelection = (selection: GraphqlAstNode, indentLevel = 1): string => {
  const indent = '  '.repeat(indentLevel);

  if (selection.kind === 'Field') {
    const alias = selection.alias ? `${selection.alias.value}: ` : '';
    const args = selection.arguments?.length
      ? `(${selection.arguments.map((argument: GraphqlAstNode) => `${argument.name.value}: ${printValue(argument.value)}`).join(', ')})`
      : '';
    const directives = printDirectives(selection.directives);
    const nested = selection.selectionSet ? printSelectionSet(selection.selectionSet, indentLevel) : '';
    return `${indent}${alias}${selection.name.value}${args}${directives}${nested}`;
  }

  if (selection.kind === 'FragmentSpread') {
    return `${indent}...${selection.name.value}${printDirectives(selection.directives)}`;
  }

  if (selection.kind === 'InlineFragment') {
    const typeCondition = selection.typeCondition ? ` on ${selection.typeCondition.name.value}` : '';
    return `${indent}...${typeCondition}${printDirectives(selection.directives)}${printSelectionSet(selection.selectionSet, indentLevel)}`;
  }

  throw new Error(`Unsupported GraphQL selection node: ${selection.kind}`);
};

const printSelectionSet = (selectionSet: GraphqlAstNode, indentLevel = 1): string => {
  const indent = '  '.repeat(Math.max(indentLevel - 1, 0));
  const body = selectionSet.selections.map((selection: GraphqlAstNode) => printSelection(selection, indentLevel + 1)).join('\n');
  return ` {\n${body}\n${indent}}`;
};

export const printGraphqlDocument = (documentNode: GraphqlAstNode): string =>
  documentNode.definitions
    .map((definition: GraphqlAstNode) => {
      if (definition.kind === 'OperationDefinition') {
        const name = definition.name ? ` ${definition.name.value}` : '';
        const variables = definition.variableDefinitions?.length
          ? `(${definition.variableDefinitions
              .map((variableDefinition: GraphqlAstNode) => {
                const defaultValue = variableDefinition.defaultValue
                  ? ` = ${printValue(variableDefinition.defaultValue)}`
                  : '';
                return `$${variableDefinition.variable.name.value}: ${printType(variableDefinition.type)}${defaultValue}`;
              })
              .join(', ')})`
          : '';
        return `${definition.operation}${name}${variables}${printDirectives(definition.directives)}${printSelectionSet(definition.selectionSet)}`;
      }

      if (definition.kind === 'FragmentDefinition') {
        return `fragment ${definition.name.value} on ${definition.typeCondition.name.value}${printDirectives(definition.directives)}${printSelectionSet(definition.selectionSet)}`;
      }

      throw new Error(`Unsupported GraphQL definition node: ${definition.kind}`);
    })
    .join('\n\n');

export const extractWindowGraphqlUri = (html: string): string | null => {
  const match = html.match(GRAPHQL_URI_PATTERN);
  return match ? match[1] : null;
};

export const extractLiteBundleUrls = (html: string): string[] => {
  const matches = html.match(LITE_BUNDLE_URL_PATTERN) || [];
  return unique(matches);
};

export const extractOperationsFromBundle = (
  bundleText: string,
  operationName?: string
): ExtractedGraphqlOperation[] => {
  const operations: ExtractedGraphqlOperation[] = [];
  const seenNames = new Set<string>();
  const operationPattern = new RegExp(OPERATION_PATTERN);

  for (const match of bundleText.matchAll(operationPattern)) {
    const type = match[1] as ExtractedGraphqlOperation['type'];
    const name = match[2];

    if (operationName && name !== operationName) {
      continue;
    }

    if (seenNames.has(name)) {
      continue;
    }

    const startHint = match.index ?? 0;
    const literal = extractDocumentLiteralForOperation(bundleText, name, startHint);
    const documentNode = evaluateDocumentLiteral(literal);

    operations.push({
      name,
      query: printGraphqlDocument(documentNode),
      type
    });
    seenNames.add(name);
  }

  return operations;
};

export const buildOperationRegistryDocument = (
  discoveryResult: MediumGraphqlDiscoveryResult,
  aliasMap: Record<string, string>,
  source: string
): MediumGraphqlRegistryDocument => {
  const operationsByName = new Map<string, ExtractedGraphqlOperation>();

  for (const bundle of discoveryResult.bundles) {
    for (const operation of bundle.operations) {
      operationsByName.set(operation.name, operation);
    }
  }

  const operations: Record<string, MediumGraphqlRegistryOperationEntry> = {};

  for (const [alias, operationName] of Object.entries(aliasMap)) {
    const operation = operationsByName.get(operationName);
    if (!operation) {
      throw new Error(`Operation "${operationName}" was not found in the discovered bundle set.`);
    }

    operations[alias] = {
      endpoint: discoveryResult.graphQlUri || 'https://medium.com/_/graphql',
      referer: discoveryResult.finalUrl,
      source,
      body: {
        operationName: operation.name,
        query: operation.query,
        variables: {}
      }
    };
  }

  return { operations };
};

class MediumGraphqlDiscovery {
  constructor(private client = new MediumGraphqlClient()) {}

  public async inspectWriterSurface(
    options: MediumGraphqlDiscoveryOptions = {}
  ): Promise<MediumGraphqlDiscoveryResult> {
    const pageUrl = options.pageUrl || 'https://medium.com/me/stories/drafts';
    const maxBundles = options.maxBundles ?? 6;
    const page = await this.client.fetchText(pageUrl);
    const graphQlUri = extractWindowGraphqlUri(page.data);
    const bundleUrls = extractLiteBundleUrls(page.data).slice(0, maxBundles);
    const bundles: DiscoveredGraphqlBundle[] = [];

    for (const bundleUrl of bundleUrls) {
      const bundle = await this.client.fetchText(bundleUrl, page.finalUrl);
      const operations = extractOperationsFromBundle(bundle.data, options.operationName);
      bundles.push({
        operationCount: operations.length,
        operations,
        status: bundle.status,
        url: bundleUrl
      });
    }

    return {
      bundleUrls,
      bundles,
      finalUrl: page.finalUrl,
      graphQlUri,
      operationFilter: options.operationName || null,
      pageUrl,
      status: page.status
    };
  }
}

export default MediumGraphqlDiscovery;
