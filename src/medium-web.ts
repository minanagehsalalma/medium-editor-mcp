import { config } from 'dotenv';
import type { Browser, BrowserContext, Cookie, Page } from 'playwright';
import { ImportedCookie, loadMediumSessionCookies } from './medium-session';

config();

export interface MediumDraftInput {
  title: string;
  contentMarkdown?: string;
  contentHtml?: string;
  subtitle?: string;
  publish?: boolean;
}

export interface MediumDraftResult {
  draftUrl: string;
  title: string;
  bodyMode: 'markdown' | 'html';
  usedSessionSource: 'cdp' | 'cookies';
  mediumEditorReady: boolean;
}

const TITLE_SELECTORS = [
  'h1[contenteditable="true"]',
  '[data-testid="storyTitleEditor"] [contenteditable="true"]',
  '[aria-label="Title"] [contenteditable="true"]',
  'textarea[placeholder*="Title"]'
];

const BODY_SELECTORS = [
  '[data-testid="editor"] [contenteditable="true"]',
  'article [contenteditable="true"]',
  'main [contenteditable="true"]',
  'p[contenteditable="true"]'
];

function sameSiteToPlaywright(value: string | null | undefined): Cookie['sameSite'] | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized === 'strict') {
    return 'Strict';
  }
  if (normalized === 'lax') {
    return 'Lax';
  }
  if (normalized === 'none' || normalized === 'no_restriction') {
    return 'None';
  }

  return undefined;
}

export function normalizeImportedCookies(cookies: ImportedCookie[]): Cookie[] {
  return cookies.map((cookie) => {
    const normalized: Cookie = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || 'medium.com',
      path: cookie.path || '/',
      httpOnly: Boolean(cookie.httpOnly),
      secure: cookie.secure ?? true,
      sameSite: sameSiteToPlaywright(cookie.sameSite) || 'Lax',
      expires: !cookie.session && typeof cookie.expirationDate === 'number'
        ? Math.floor(cookie.expirationDate)
        : -1
    };

    return normalized;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export function renderMarkdownToHtml(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const chunks: string[] = [];

  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listTag: 'ul' | 'ol' | null = null;
  let codeFence: { language: string; lines: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    chunks.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length || !listTag) {
      return;
    }

    chunks.push(`<${listTag}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${listTag}>`);
    listItems = [];
    listTag = null;
  };

  const flushCodeFence = () => {
    if (!codeFence) {
      return;
    }

    const className = codeFence.language ? ` class="language-${escapeHtml(codeFence.language)}"` : '';
    chunks.push(`<pre><code${className}>${escapeHtml(codeFence.lines.join('\n'))}</code></pre>`);
    codeFence = null;
  };

  for (const line of lines) {
    const codeMatch = line.match(/^```(.*)$/);
    if (codeMatch) {
      if (codeFence) {
        flushCodeFence();
      } else {
        flushParagraph();
        flushList();
        codeFence = {
          language: codeMatch[1].trim(),
          lines: []
        };
      }
      continue;
    }

    if (codeFence) {
      codeFence.lines.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      chunks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      chunks.push('<hr />');
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      chunks.push(`<blockquote><p>${renderInlineMarkdown(quoteMatch[1].trim())}</p></blockquote>`);
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listTag && listTag !== 'ul') {
        flushList();
      }
      listTag = 'ul';
      listItems.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listTag && listTag !== 'ol') {
        flushList();
      }
      listTag = 'ol';
      listItems.push(orderedMatch[1].trim());
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCodeFence();

  return chunks.join('\n');
}

class MediumWebClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sessionSource: 'cdp' | 'cookies' | null = null;

  private getCookieSource(): ImportedCookie[] {
    return loadMediumSessionCookies().cookies;
  }

  private async initCdpContext(endpoint: string): Promise<void> {
    const playwright = await import('playwright');
    this.browser = await playwright.chromium.connectOverCDP(endpoint);

    const contexts = this.browser.contexts();
    this.context = contexts[0] || await this.browser.newContext();
    this.page = this.context.pages()[0] || await this.context.newPage();
    this.sessionSource = 'cdp';
  }

  private async initCookieContext(): Promise<void> {
    const playwright = await import('playwright');
    this.browser = await playwright.chromium.launch({
      channel: process.env.MEDIUM_BROWSER_CHANNEL || 'chrome',
      headless: process.env.MEDIUM_BROWSER_HEADLESS === 'true'
    });

    this.context = await this.browser.newContext();
    await this.context.addCookies(normalizeImportedCookies(this.getCookieSource()));
    this.page = await this.context.newPage();
    this.sessionSource = 'cookies';
  }

  private async ensureContext(): Promise<void> {
    if (this.context && this.page && this.browser && this.sessionSource) {
      return;
    }

    const cdpEndpoint = process.env.MEDIUM_CDP_ENDPOINT?.trim();
    if (cdpEndpoint) {
      await this.initCdpContext(cdpEndpoint);
      return;
    }

    await this.initCookieContext();
  }

  private async ensureMediumPermissions(): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context is not initialized.');
    }

    await this.context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'https://medium.com'
    });
  }

  private async firstVisibleSelector(page: Page, selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        try {
          if (await locator.isVisible({ timeout: 500 })) {
            return selector;
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  private async getTitleLocator(page: Page) {
    const selector = await this.firstVisibleSelector(page, TITLE_SELECTORS);
    if (!selector) {
      throw new Error('Could not find the Medium title editor.');
    }

    return page.locator(selector).first();
  }

  private async getBodyLocator(page: Page) {
    const selector = await this.firstVisibleSelector(page, BODY_SELECTORS);
    if (selector) {
      return page.locator(selector).last();
    }

    const editables = page.locator('[contenteditable="true"]');
    if (await editables.count()) {
      return editables.last();
    }

    throw new Error('Could not find the Medium body editor.');
  }

  private async setTitle(page: Page, title: string): Promise<void> {
    const titleLocator = await this.getTitleLocator(page);
    await titleLocator.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(title);
  }

  private async focusBody(page: Page): Promise<void> {
    const bodyLocator = await this.getBodyLocator(page);
    await bodyLocator.click();
  }

  private async pasteRichBody(page: Page, html: string, plainText: string): Promise<void> {
    await this.ensureMediumPermissions();
    await this.focusBody(page);

    await page.evaluate(
      async ({ richHtml, text }) => {
        const Clipboard = (globalThis as any).ClipboardItem;
        const clipboard = (globalThis as any).navigator?.clipboard;
        const item = new Clipboard({
          'text/html': new Blob([richHtml], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        });
        await clipboard.write([item]);
      },
      { richHtml: html, text: plainText }
    );

    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Control+V');
  }

  private async ensureAuthenticated(page: Page): Promise<void> {
    await page.goto('https://medium.com/me/stories/drafts', {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForLoadState('networkidle').catch(() => undefined);
    const url = page.url();
    if (url.includes('/m/signin') || url.includes('/signin')) {
      throw new Error('Medium session is not authenticated. Refresh the cookies or attach a signed-in browser profile.');
    }
  }

  public async verifySession(): Promise<{
    authenticated: boolean;
    sessionSource: 'cdp' | 'cookies';
    url: string;
  }> {
    await this.ensureContext();

    if (!this.page || !this.sessionSource) {
      throw new Error('Browser page is not initialized.');
    }

    await this.ensureAuthenticated(this.page);

    return {
      authenticated: true,
      sessionSource: this.sessionSource,
      url: this.page.url()
    };
  }

  public async createDraft(input: MediumDraftInput): Promise<MediumDraftResult> {
    await this.ensureContext();

    if (!this.page || !this.sessionSource) {
      throw new Error('Browser page is not initialized.');
    }

    await this.ensureAuthenticated(this.page);
    await this.page.goto('https://medium.com/new-story', {
      waitUntil: 'domcontentloaded'
    });
    await this.page.waitForLoadState('networkidle').catch(() => undefined);

    await this.setTitle(this.page, input.title);

    const plainText = input.contentMarkdown || input.contentHtml || '';
    const bodyHtml = input.contentHtml || renderMarkdownToHtml(input.contentMarkdown || '');
    const contentText = input.subtitle
      ? `${input.subtitle}\n\n${plainText}`.trim()
      : plainText;
    const contentHtml = input.subtitle
      ? `<p><em>${input.subtitle}</em></p>\n${bodyHtml}`
      : bodyHtml;

    if (contentHtml || contentText) {
      await this.pasteRichBody(this.page, contentHtml, contentText);
    }

    await this.page.waitForTimeout(1500);

    return {
      draftUrl: this.page.url(),
      title: input.title,
      bodyMode: input.contentHtml ? 'html' : 'markdown',
      usedSessionSource: this.sessionSource,
      mediumEditorReady: true
    };
  }

  public async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.context = null;
    this.browser = null;
    this.page = null;
    this.sessionSource = null;
  }
}

export default MediumWebClient;
