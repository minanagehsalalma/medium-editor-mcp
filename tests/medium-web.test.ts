import { normalizeImportedCookies, renderMarkdownToHtml } from '../src/medium-web';

describe('MediumWeb helpers', () => {
  it('normalizes browser-exported cookies into Playwright cookies', () => {
    const normalized = normalizeImportedCookies([
      {
        domain: '.medium.com',
        expirationDate: 1779710653.65804,
        httpOnly: true,
        name: 'xsrf',
        path: '/',
        sameSite: 'no_restriction',
        secure: true,
        session: false,
        value: 'abc123'
      },
      {
        domain: 'medium.com',
        httpOnly: false,
        name: 'sz',
        path: '/',
        sameSite: null,
        secure: false,
        session: true,
        value: '2028'
      }
    ]);

    expect(normalized).toEqual([
      expect.objectContaining({
        name: 'xsrf',
        domain: '.medium.com',
        httpOnly: true,
        secure: true,
        path: '/',
        sameSite: 'None',
        expires: 1779710653
      }),
      expect.objectContaining({
        name: 'sz',
        domain: 'medium.com',
        httpOnly: false,
        secure: false,
        path: '/'
      })
    ]);
  });

  it('renders markdown into HTML for rich paste into the Medium editor', () => {
    const html = renderMarkdownToHtml('# Title\n\n- one\n- two\n\n```ts\nconst x = 1;\n```');

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<code class="language-ts">');
  });
});
