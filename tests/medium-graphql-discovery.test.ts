import {
  buildOperationRegistryDocument,
  extractLiteBundleUrls,
  extractOperationsFromBundle,
  extractWindowGraphqlUri
} from '../src/medium-graphql-discovery';

describe('Medium GraphQL discovery helpers', () => {
  it('extracts the writer page GraphQL URI and bundle URLs from HTML', () => {
    const html = `
      <script>window.__GRAPHQL_URI__ = "https://medium.com/_/graphql"</script>
      <script src="https://cdn-client.medium.com/lite/static/js/main.123.js"></script>
      <script src="https://cdn-client.medium.com/lite/static/js/WriterOutboxPage.MainContent.456.chunk.js"></script>
    `;

    expect(extractWindowGraphqlUri(html)).toBe('https://medium.com/_/graphql');
    expect(extractLiteBundleUrls(html)).toEqual([
      'https://cdn-client.medium.com/lite/static/js/main.123.js',
      'https://cdn-client.medium.com/lite/static/js/WriterOutboxPage.MainContent.456.chunk.js'
    ]);
  });

  it('rebuilds an embedded GraphQL operation document from a lite bundle', () => {
    const bundle = `
      "use strict";
      var queryDoc={kind:"Document",definitions:[
        {kind:"OperationDefinition",operation:"query",name:{kind:"Name",value:"WriterOutboxPageNavigationBarQuery"},selectionSet:{kind:"SelectionSet",selections:[
          {kind:"Field",name:{kind:"Name",value:"viewer"},selectionSet:{kind:"SelectionSet",selections:[
            {kind:"Field",name:{kind:"Name",value:"id"}}
          ]}}
        ]}},
        {kind:"FragmentDefinition",name:{kind:"Name",value:"ViewerBits"},typeCondition:{kind:"NamedType",name:{kind:"Name",value:"User"}},selectionSet:{kind:"SelectionSet",selections:[
          {kind:"Field",name:{kind:"Name",value:"name"}}
        ]}}
      ]},otherValue=1;
    `;

    const operations = extractOperationsFromBundle(bundle);

    expect(operations).toHaveLength(1);
    expect(operations[0].name).toBe('WriterOutboxPageNavigationBarQuery');
    expect(operations[0].type).toBe('query');
    expect(operations[0].query).toContain('query WriterOutboxPageNavigationBarQuery {');
    expect(operations[0].query).toContain('viewer {');
    expect(operations[0].query).toContain('id');
    expect(operations[0].query).toContain('fragment ViewerBits on User {');
  });

  it('builds registry entries from discovered operations', () => {
    const registry = buildOperationRegistryDocument(
      {
        bundleUrls: ['https://cdn-client.medium.com/lite/static/js/app.chunk.js'],
        bundles: [
          {
            operationCount: 1,
            operations: [
              {
                name: 'ViewerQuery',
                type: 'query',
                query: 'query ViewerQuery { viewer { id } }'
              }
            ],
            status: 200,
            url: 'https://cdn-client.medium.com/lite/static/js/app.chunk.js'
          }
        ],
        finalUrl: 'https://medium.com/me/stories',
        graphQlUri: 'https://medium.com/_/graphql',
        operationFilter: null,
        pageUrl: 'https://medium.com/me/stories',
        status: 200
      },
      {
        viewer: 'ViewerQuery'
      },
      'unit-test-source'
    );

    expect(registry).toEqual({
      operations: {
        viewer: {
          endpoint: 'https://medium.com/_/graphql',
          referer: 'https://medium.com/me/stories',
          source: 'unit-test-source',
          body: {
            operationName: 'ViewerQuery',
            query: 'query ViewerQuery { viewer { id } }',
            variables: {}
          }
        }
      }
    });
  });
});
