import MediumPostWorkflows from '../src/medium-post-workflows';

describe('MediumPostWorkflows', () => {
  it('clones a source post into a fresh published post with metadata updates', async () => {
    const legacyClient = {
      getDraft: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Source title',
                previewContent: {
                  subtitle: 'Source subtitle'
                },
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title-1', type: 3, text: 'Source title', markups: [] },
                      { name: 'body-1', type: 1, text: 'Source intro', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: -1
              },
              normalizingDeltas: [{ type: 8, index: 0 }]
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Custom subtitle'
                }
              }
            }
          }
        }),
      getPost: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 4,
                content: {
                  bodyModel: {
                    paragraphs: []
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Cloned title',
                mediumUrl: 'https://medium.com/p/new-post',
                uniqueSlug: 'new-post',
                firstPublishedAt: 1779722850889,
                latestPublishedAt: 1779722850889,
                hasUnpublishedEdits: false
              }
            }
          }
        }),
      createDraft: jest.fn().mockResolvedValue({
        data: {
          payload: {
            id: 'new-post-id'
          }
        }
      }),
      applyDeltas: jest
        .fn()
        .mockResolvedValueOnce({ status: 200, data: { success: true } })
        .mockResolvedValueOnce({ status: 200, data: { success: true } }),
      publishPost: jest.fn().mockResolvedValue({ status: 200, data: { success: true } })
    } as any;

    const graphqlClient = {
      executeRegisteredOperation: jest.fn().mockResolvedValue({ status: 200, data: { success: true } })
    } as any;

    const workflows = new MediumPostWorkflows(legacyClient, graphqlClient);
    const result = await workflows.clonePostToFreshPost({
      postId: 'source-post-id',
      title: 'Cloned title',
      subtitle: 'Custom subtitle',
      tagNames: ['Cybersecurity', 'Infosec'],
      seoTitle: 'SEO title',
      seoDescription: 'SEO description',
      canonicalUrl: 'https://example.com/canonical',
      publish: true
    });

    expect(result.newPostId).toBe('new-post-id');
    expect(legacyClient.applyDeltas).toHaveBeenNthCalledWith(1, 'new-post-id', -1, [{ type: 8, index: 0 }]);
    expect(legacyClient.applyDeltas).toHaveBeenNthCalledWith(
      2,
      'new-post-id',
      4,
      [
        expect.objectContaining({
          type: 1,
          index: 0,
          paragraph: expect.objectContaining({ text: 'Cloned title' })
        }),
        expect.objectContaining({
          type: 1,
          index: 1,
          paragraph: expect.objectContaining({ text: 'Source intro' })
        }),
        expect.objectContaining({
          type: 5,
          text: 'Custom subtitle'
        })
      ]
    );
    expect(graphqlClient.executeRegisteredOperation).toHaveBeenCalledWith(
      'stage-update-post-metadata',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: {
            input: {
              targetPostId: 'new-post-id',
              subtitle: 'Custom subtitle'
            }
          }
        })
      })
    );
    expect(legacyClient.publishPost).toHaveBeenCalledWith('new-post-id');
  });

  it('replaces an imported post and converts the original into a historical stub', async () => {
    const legacyClient = {
      getPost: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Original router write-up',
                firstPublishedAt: Date.UTC(2021, 1, 12, 0, 0, 0)
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 3,
                content: {
                  bodyModel: {
                    paragraphs: []
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Replacement title',
                mediumUrl: 'https://medium.com/p/replacement',
                uniqueSlug: 'replacement',
                firstPublishedAt: 1779722850889,
                latestPublishedAt: 1779722850889,
                hasUnpublishedEdits: false
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 11,
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title-old', type: 3, text: 'Old title', markups: [] },
                      { name: 'hero-old', type: 4, text: '', markups: [] },
                      { name: 'intro-old', type: 1, text: 'Old intro', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Original 2021 Medium Post: Original router write-up',
                mediumUrl: 'https://medium.com/p/original'
              }
            }
          }
        }),
      getDraft: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Original router write-up',
                previewContent: {
                  subtitle: 'Original subtitle'
                },
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title-src', type: 3, text: 'Original router write-up', markups: [] },
                      { name: 'body-src', type: 1, text: 'Original intro', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: -1
              },
              normalizingDeltas: [{ type: 8, index: 0 }]
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Replacement subtitle'
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 11,
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title-old', type: 3, text: 'Old title', markups: [] },
                      { name: 'hero-old', type: 4, text: '', markups: [] },
                      { name: 'intro-old', type: 1, text: 'Old intro', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Original February 12, 2021 Medium publication. Republished and polished current version available at the newer Medium URL.'
                }
              }
            }
          }
        }),
      createDraft: jest.fn().mockResolvedValue({
        data: {
          payload: {
            id: 'replacement-post-id'
          }
        }
      }),
      applyDeltas: jest
        .fn()
        .mockResolvedValueOnce({ status: 200, data: { success: true } })
        .mockResolvedValueOnce({ status: 200, data: { success: true } })
        .mockResolvedValueOnce({ status: 200, data: { success: true } }),
      publishPost: jest
        .fn()
        .mockResolvedValueOnce({ status: 200, data: { success: true } })
        .mockResolvedValueOnce({ status: 200, data: { success: true } })
    } as any;

    const graphqlClient = {
      executeRegisteredOperation: jest.fn().mockResolvedValue({ status: 200, data: { success: true } })
    } as any;

    const workflows = new MediumPostWorkflows(legacyClient, graphqlClient);
    const result = await workflows.replaceImportedPost({
      postId: 'original-post-id',
      title: 'Replacement title',
      subtitle: 'Replacement subtitle',
      seoTitle: 'Replacement SEO title',
      seoDescription: 'Replacement SEO description',
      publish: true
    });

    expect(result.replacement.mediumUrl).toBe('https://medium.com/p/replacement');
    expect(legacyClient.applyDeltas).toHaveBeenNthCalledWith(
      3,
      'original-post-id',
      11,
      [
        expect.objectContaining({
          type: 3,
          paragraph: expect.objectContaining({
            text: 'Original 2021 Medium Post: Original router write-up'
          })
        }),
        expect.objectContaining({
          type: 3,
          paragraph: expect.objectContaining({
            text: expect.stringContaining('https://medium.com/p/replacement')
          })
        }),
        expect.objectContaining({
          type: 5,
          text: 'Original February 12, 2021 Medium publication. Republished and polished current version available at the newer Medium URL.'
        })
      ]
    );
    expect(graphqlClient.executeRegisteredOperation).toHaveBeenCalledWith(
      'update-canonical-url',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: {
            input: {
              postId: 'original-post-id',
              url: 'https://medium.com/p/replacement'
            }
          }
        })
      })
    );
  });

  it('inspects private and public post state and flags common issues', async () => {
    const legacyClient = {
      getPost: jest.fn().mockResolvedValue({
        data: {
          payload: {
            value: {
              title: 'Live title',
              mediumUrl: 'https://medium.com/p/live-post',
              firstPublishedAt: Date.UTC(2021, 1, 12, 0, 0, 0),
              importedPublishedAt: Date.UTC(2021, 1, 12, 0, 0, 0),
              importedUrl: 'https://example.com/original'
            }
          }
        }
      }),
      getDraft: jest.fn().mockResolvedValue({
        data: {
          payload: {
            value: {
              previewContent: {
                subtitle: 'x'
              },
              content: {
                bodyModel: {
                  paragraphs: [
                    { name: 'title', type: 3, text: 'Live title', markups: [] },
                    { name: 'intro', type: 1, text: 'This is the intro paragraph for a strong subtitle and description.', markups: [] }
                  ]
                }
              }
            }
          }
        }
      })
    } as any;

    const graphqlClient = {
      executeRegisteredOperation: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            data: {
              postResult: {
                id: 'post-1',
                isLocked: false,
                visibility: 'PUBLIC',
                responseDistribution: 'ENABLED'
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            data: {
              post: {
                id: 'post-1',
                visibility: 'PUBLIC',
                isMarkedPaywallOnly: false,
                isPublishToEmail: false,
                isNewsletter: false,
                curationEligibleAt: null
              }
            }
          }
        }),
      fetchText: jest.fn().mockResolvedValue({
        finalUrl: 'https://medium.com/p/live-post',
        data: [
          '<html><head>',
          '<title>Public title</title>',
          '<meta property="og:title" content="Old og title">',
          '<meta name="description" content="Public description">',
          '<link rel="canonical" href="https://example.com/canonical">',
          '<meta property="article:published_time" content="2021-02-12T00:00:00.000Z">',
          '</head></html>'
        ].join('')
      })
    } as any;

    const workflows = new MediumPostWorkflows(legacyClient, graphqlClient);
    const result = await workflows.inspectPostState({
      postId: 'post-1'
    });

    expect(result.privateState.derivedSubtitle).toContain('This is the intro paragraph');
    expect(result.privateState.introParagraph).toContain('This is the intro paragraph');
    expect(result.privateState.hasPreviewImage).toBe(false);
    expect(result.publicMetadata?.canonicalUrl).toBe('https://example.com/canonical');
    expect(result.appealAssessment.signals.titleLength).toBe('Live title'.length);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'broken_subtitle_probe_artifact',
        'public_title_mismatch',
        'canonical_diverges_from_medium_url',
        'likely_imported_date_lock',
        'title_length_out_of_range',
        'missing_preview_image'
      ])
    );
  });

  it('optimizes an existing post and verifies resulting public metadata', async () => {
    const legacyClient = {
      getPost: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 5,
                title: 'Existing title',
                mediumUrl: 'https://medium.com/p/existing-post',
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'Existing title', markups: [] },
                      { name: 'intro', type: 1, text: 'Existing intro paragraph for deriving metadata.', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 5,
                title: 'Existing title',
                mediumUrl: 'https://medium.com/p/existing-post',
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'Existing title', markups: [] },
                      { name: 'intro', type: 1, text: 'Existing intro paragraph for deriving metadata.', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Existing title',
                mediumUrl: 'https://medium.com/p/existing-post',
                firstPublishedAt: 1779722850889,
                latestPublishedAt: 1779722850889,
                hasUnpublishedEdits: false
              }
            }
          }
        }),
      getDraft: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: ''
                },
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'Existing title', markups: [] },
                      { name: 'intro', type: 1, text: 'Existing intro paragraph for deriving metadata.', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: ''
                },
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'Existing title', markups: [] },
                      { name: 'intro', type: 1, text: 'Existing intro paragraph for deriving metadata.', markups: [] }
                    ]
                  }
                },
                latestRev: 5
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Existing intro paragraph for deriving metadata.'
                }
              }
            }
          }
        }),
      applyDeltas: jest.fn().mockResolvedValue({ status: 200, data: { success: true } }),
      publishPost: jest.fn().mockResolvedValue({ status: 200, data: { success: true } })
    } as any;

    const graphqlClient = {
      executeRegisteredOperation: jest.fn().mockResolvedValue({ status: 200, data: { success: true } }),
      fetchText: jest.fn().mockResolvedValue({
        finalUrl: 'https://medium.com/p/existing-post',
        data: [
          '<html><head>',
          '<meta property="og:title" content="Existing title">',
          '<meta name="description" content="Existing intro paragraph for deriving metadata.">',
          '<link rel="canonical" href="https://medium.com/p/existing-post">',
          '</head></html>'
        ].join('')
      })
    } as any;

    const workflows = new MediumPostWorkflows(legacyClient, graphqlClient);
    const result = await workflows.optimizeExistingPost({
      postId: 'post-2',
      tagNames: ['Cybersecurity']
    });

    expect(result.applied.subtitle).toBe('Existing intro paragraph for deriving metadata.');
    expect(graphqlClient.executeRegisteredOperation).toHaveBeenCalledWith(
      'set-post-tags',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: {
            targetPostId: 'post-2',
            tagNames: ['Cybersecurity']
          }
        })
      })
    );
    expect(result.publicMetadata?.description).toBe('Existing intro paragraph for deriving metadata.');
  });

  it('creates a share key for a post', async () => {
    const legacyClient = {
      getPost: jest.fn().mockResolvedValue({
        data: {
          payload: {
            value: {
              mediumUrl: 'https://medium.com/p/shareable-post'
            }
          }
        }
      })
    } as any;

    const graphqlClient = {
      executeRegisteredOperation: jest.fn().mockResolvedValue({
        data: {
          data: {
            createPostShareKey: {
              key: 'share-key-123'
            }
          }
        }
      })
    } as any;

    const workflows = new MediumPostWorkflows(legacyClient, graphqlClient);
    const result = await workflows.createShareKey('post-3');

    expect(result).toEqual({
      postId: 'post-3',
      mediumUrl: 'https://medium.com/p/shareable-post',
      shareKey: 'share-key-123'
    });
  });

  it('optimizes verified visibility settings and returns before/after state', async () => {
    const legacyClient = {
      getPost: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Visibility test',
                mediumUrl: 'https://medium.com/p/visibility-test',
                allowResponses: false,
                isLocked: true,
                visibility: 'LOCKED'
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                mediumUrl: 'https://medium.com/p/visibility-test'
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Visibility test',
                mediumUrl: 'https://medium.com/p/visibility-test',
                allowResponses: true,
                isLocked: true,
                visibility: 'LOCKED'
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                mediumUrl: 'https://medium.com/p/visibility-test'
              }
            }
          }
        }),
      getDraft: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Subtitle'
                },
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'Visibility test', markups: [] },
                      { name: 'intro', type: 1, text: 'Intro paragraph', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Subtitle'
                },
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'Visibility test', markups: [] },
                      { name: 'intro', type: 1, text: 'Intro paragraph', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
    } as any;

    const graphqlClient = {
      executeRegisteredOperation: jest.fn().mockImplementation(async (alias: string) => {
        if (alias === 'post-settings') {
          return {
            data: {
              data: {
                postResult: {
                  id: 'post-visibility',
                  isLocked: true,
                  visibility: 'LOCKED',
                  responseDistribution: 'ENABLED'
                }
              }
            }
          };
        }

        if (alias === 'post-published-dialog') {
          return {
            data: {
              data: {
                post: {
                  id: 'post-visibility',
                  visibility: 'LOCKED',
                  isMarkedPaywallOnly: true,
                  isPublishToEmail: false,
                  isNewsletter: false,
                  curationEligibleAt: null
                }
              }
            }
          };
        }

        if (alias === 'create-post-share-key') {
          return {
            data: {
              data: {
                createPostShareKey: {
                  key: 'share-key-456'
                }
              }
            }
          };
        }

        return { status: 200, data: { success: true } };
      }),
      fetchText: jest.fn().mockResolvedValue({
        finalUrl: 'https://medium.com/p/visibility-test',
        data: '<html><head><meta property="og:title" content="Visibility test"><link rel="canonical" href="https://medium.com/p/visibility-test"></head></html>'
      })
    } as any;

    const workflows = new MediumPostWorkflows(legacyClient, graphqlClient);
    const result = await workflows.optimizeVisibility({
      postId: 'post-visibility'
    });

    expect(graphqlClient.executeRegisteredOperation).toHaveBeenCalledWith(
      'post-allow-responses',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: {
            targetPostId: 'post-visibility',
            allowResponses: true
          }
        })
      })
    );
    expect(graphqlClient.executeRegisteredOperation).toHaveBeenCalledWith(
      'set-publishing-flow-defaults',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: {
            postId: 'post-visibility'
          }
        })
      })
    );
    expect(result.actions.shareKey).toEqual({
      postId: 'post-visibility',
      mediumUrl: 'https://medium.com/p/visibility-test',
      shareKey: 'share-key-456'
    });
    expect(result.before.privateState.allowResponses).toBe(false);
  });

  it('auto-rewrites weak live post packaging before applying metadata updates', async () => {
    const legacyClient = {
      getPost: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 5,
                title: 'retry',
                mediumUrl: 'https://medium.com/p/retry-post',
                previewImage: null,
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'retry', markups: [] },
                      { name: 'intro', type: 1, text: 'Short intro.', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 5,
                title: 'retry',
                mediumUrl: 'https://medium.com/p/retry-post',
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'retry', markups: [] },
                      { name: 'intro', type: 1, text: 'Short intro.', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                title: 'Retry: Short intro',
                mediumUrl: 'https://medium.com/p/retry-post',
                firstPublishedAt: 1779722850889,
                latestPublishedAt: 1779722850889,
                hasUnpublishedEdits: false
              }
            }
          }
        }),
      getDraft: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: ''
                },
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'retry', markups: [] },
                      { name: 'intro', type: 1, text: 'Short intro.', markups: [] }
                    ]
                  }
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: ''
                },
                content: {
                  bodyModel: {
                    paragraphs: [
                      { name: 'title', type: 3, text: 'retry', markups: [] },
                      { name: 'intro', type: 1, text: 'Short intro.', markups: [] }
                    ]
                  }
                },
                latestRev: 5
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Short intro. The useful part is understanding when it helps, how it works, and which trade-offs appear once you try to reuse it in practice.'
                }
              }
            }
          }
        }),
      applyDeltas: jest.fn().mockResolvedValue({ status: 200, data: { success: true } }),
      publishPost: jest.fn().mockResolvedValue({ status: 200, data: { success: true } })
    } as any;

    const graphqlClient = {
      executeRegisteredOperation: jest.fn().mockResolvedValue({ status: 200, data: { success: true } }),
      fetchText: jest.fn().mockResolvedValue({
        finalUrl: 'https://medium.com/p/retry-post',
        data: '<html><head><meta property="og:title" content="Retry: Short intro"><meta name="description" content="Short intro. The useful part is understanding when it helps, how it works, and which trade-offs appear once you try to reuse it in practice."><link rel="canonical" href="https://medium.com/p/retry-post"></head></html>'
      })
    } as any;

    const workflows = new MediumPostWorkflows(legacyClient, graphqlClient);
    const result = await workflows.optimizeExistingPost({
      postId: 'post-3',
      autoRewritePackage: true
    });

    expect(result.packageOptimization.auditAfter.score).toBeGreaterThan(result.packageOptimization.auditBefore.score);
    expect(result.applied.title).not.toBe('retry');
    expect(result.applied.tagNames.length).toBeGreaterThanOrEqual(3);
  });

  it('creates a disposable draft and verifies the write path', async () => {
    const richDraftWriter = {
      createDraft: jest.fn().mockResolvedValue({
        postId: 'draft-check-1',
        created: { payload: { id: 'draft-check-1' } }
      })
    } as any;

    const legacyClient = {
      getPost: jest.fn().mockResolvedValue({
        data: {
          payload: {
            value: {
              title: 'Medium MCP Write Path Check',
              latestRev: 3,
              content: {
                bodyModel: {
                  paragraphs: [
                    { text: 'Medium MCP Write Path Check' },
                    { text: 'Disposable draft created to verify the legacy editor write path.' },
                    { text: 'Verification checklist' }
                  ]
                }
              }
            }
          }
        }
      }),
      getDraft: jest.fn().mockResolvedValue({
        data: {
          payload: {
            value: {
              previewContent: {
                subtitle: 'Disposable draft created to verify the legacy editor write path.'
              },
              content: {
                bodyModel: {
                  paragraphs: [
                    { text: 'Medium MCP Write Path Check' },
                    { text: 'Disposable draft created to verify the legacy editor write path.' },
                    { text: 'Verification checklist' }
                  ]
                }
              }
            }
          }
        }
      })
    } as any;

    const workflows = new MediumPostWorkflows(legacyClient, {} as any, richDraftWriter);
    const result = await workflows.testWritePath();

    expect(richDraftWriter.createDraft).toHaveBeenCalled();
    expect(result.verification.titleMatches).toBe(true);
    expect(result.verification.previewSubtitleMatches).toBe(true);
    expect(result.verification.bodyContainsVerificationChecklist).toBe(true);
  });

  it('optimizes, creates, publishes, and verifies a fresh post in one workflow', async () => {
    const richDraftWriter = {
      createDraft: jest.fn().mockResolvedValue({
        postId: 'published-draft-1',
        created: { payload: { id: 'published-draft-1' } }
      })
    } as any;

    const legacyClient = {
      publishPost: jest.fn().mockResolvedValue({ status: 200, data: { success: true } }),
      getPost: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                mediumUrl: 'https://medium.com/p/published-draft-1',
                title: 'Retry: Short intro',
                firstPublishedAt: 1779722850889,
                latestPublishedAt: 1779722850889
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                mediumUrl: 'https://medium.com/p/published-draft-1',
                title: 'Retry: Short intro'
              }
            }
          }
        }),
      getDraft: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Short intro. The useful part is understanding how it works, when it helps, and where the trade-offs start showing up.'
                }
              }
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Short intro. The useful part is understanding how it works, when it helps, and where the trade-offs start showing up.'
                }
              }
            }
          }
        })
    } as any;

    const graphqlClient = {
      executeRegisteredOperation: jest.fn().mockResolvedValue({ status: 200, data: { success: true } }),
      fetchText: jest.fn().mockResolvedValue({
        finalUrl: 'https://medium.com/p/published-draft-1',
        data: '<html><head><meta property="og:title" content="Retry: Short intro"><meta name="description" content="Short intro. The useful part is understanding how it works, when it helps, and where the trade-offs start showing up."><link rel="canonical" href="https://medium.com/p/published-draft-1"></head></html>'
      })
    } as any;

    const workflows = new MediumPostWorkflows(legacyClient, graphqlClient, richDraftWriter);
    const result = await workflows.publishOptimizedDraft({
      title: 'retry',
      markdown: '# retry\n\nShort intro.',
      tagNames: ['TypeScript'],
      createShareKey: false,
      optimizeVisibility: false
    });

    expect(richDraftWriter.createDraft).toHaveBeenCalled();
    expect(graphqlClient.executeRegisteredOperation).toHaveBeenCalledWith(
      'set-post-tags',
      expect.objectContaining({
        body: expect.objectContaining({
          variables: expect.objectContaining({
            targetPostId: 'published-draft-1'
          })
        })
      })
    );
    expect(legacyClient.publishPost).toHaveBeenCalledWith('published-draft-1');
    expect(result.finalState.mediumUrl).toBe('https://medium.com/p/published-draft-1');
  });

  it('deletes a Medium post through the registered delete mutation', async () => {
    const graphqlClient = {
      executeRegisteredOperation: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          data: {
            deletePost: true
          }
        }
      })
    } as any;

    const workflows = new MediumPostWorkflows({} as any, graphqlClient);
    const result = await workflows.deletePost('post-delete-1');

    expect(graphqlClient.executeRegisteredOperation).toHaveBeenCalledWith(
      'delete-post',
      expect.objectContaining({
        body: {
          variables: {
            targetPostId: 'post-delete-1'
          }
        },
        referer: 'https://medium.com/p/post-delete-1/settings'
      })
    );
    expect(result).toEqual({
      postId: 'post-delete-1',
      deleted: true,
      response: {
        data: {
          deletePost: true
        }
      }
    });
  });

  it('undeletes a Medium post through the registered undelete mutation', async () => {
    const graphqlClient = {
      executeRegisteredOperation: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          data: {
            undeletePost: true
          }
        }
      })
    } as any;

    const workflows = new MediumPostWorkflows({} as any, graphqlClient);
    const result = await workflows.undeletePost('post-undelete-1');

    expect(graphqlClient.executeRegisteredOperation).toHaveBeenCalledWith(
      'undelete-post',
      expect.objectContaining({
        body: {
          variables: {
            targetPostId: 'post-undelete-1'
          }
        },
        referer: 'https://medium.com/me/stories/deleted'
      })
    );
    expect(result).toEqual({
      postId: 'post-undelete-1',
      undeleted: true,
      response: {
        data: {
          undeletePost: true
        }
      }
    });
  });
});
