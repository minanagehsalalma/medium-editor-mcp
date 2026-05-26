import MediumRichDraftWriter, {
  buildParagraphDeltasFromBlocks,
  MEDIUM_PARAGRAPH_TYPES,
  parseMarkdownToMediumBlocks
} from '../src/medium-rich-draft';

describe('parseMarkdownToMediumBlocks', () => {
  it('maps common markdown structures into Medium paragraph blocks', () => {
    const blocks = parseMarkdownToMediumBlocks([
      '# Title',
      '',
      'Plain paragraph text.',
      '',
      '## Section',
      '',
      '> Quoted line',
      '',
      '- Bullet item',
      '1. Numbered item',
      '',
      '```ts',
      'const answer = 42;',
      '```'
    ].join('\n'));

    expect(blocks).toEqual([
      expect.objectContaining({ type: 'h1', text: 'Title' }),
      expect.objectContaining({ type: 'paragraph', text: 'Plain paragraph text.' }),
      expect.objectContaining({ type: 'h2', text: 'Section' }),
      expect.objectContaining({ type: 'blockquote', text: 'Quoted line' }),
      expect.objectContaining({ type: 'ul-li', text: 'Bullet item' }),
      expect.objectContaining({ type: 'ol-li', text: 'Numbered item' }),
      expect.objectContaining({ type: 'code', text: 'const answer = 42;', codeLang: 'ts' })
    ]);
  });

  it('strips inline markdown tokens from non-code paragraphs and preserves safe markups', () => {
    const blocks = parseMarkdownToMediumBlocks([
      'Use `codex --login` after **Node.js** is ready and *Ubuntu* is online.',
      '',
      '- Try `ip link show` before guessing interface names.'
    ].join('\n'));

    expect(blocks).toEqual([
      expect.objectContaining({
        type: 'paragraph',
        text: 'Use codex --login after Node.js is ready and Ubuntu is online.',
        markups: [
          { type: 1, start: 24, end: 31 },
          { type: 2, start: 45, end: 51 }
        ]
      }),
      expect.objectContaining({
        type: 'ul-li',
        text: 'Try ip link show before guessing interface names.',
        markups: []
      })
    ]);
  });

  it('keeps markdown links and bare urls clickable', () => {
    const blocks = parseMarkdownToMediumBlocks([
      'Connect on [LinkedIn](https://www.linkedin.com/in/minanagehzekry).',
      '',
      'Canonical source: https://gist.github.com/minanagehsalalma/7d1b50926ba73923ca3ecddec29c728c'
    ].join('\n'));

    expect(blocks).toEqual([
      expect.objectContaining({
        type: 'paragraph',
        text: 'Connect on LinkedIn.',
        markups: [
          {
            type: 3,
            start: 11,
            end: 19,
            href: 'https://www.linkedin.com/in/minanagehzekry',
            title: '',
            rel: 'nofollow',
            anchorType: 0
          }
        ]
      }),
      expect.objectContaining({
        type: 'paragraph',
        text: 'Canonical source: https://gist.github.com/minanagehsalalma/7d1b50926ba73923ca3ecddec29c728c',
        markups: [
          {
            type: 3,
            start: 18,
            end: 91,
            href: 'https://gist.github.com/minanagehsalalma/7d1b50926ba73923ca3ecddec29c728c',
            title: '',
            rel: 'nofollow',
            anchorType: 0
          }
        ]
      })
    ]);
  });

  it('maps markdown and html images into image blocks', () => {
    const blocks = parseMarkdownToMediumBlocks([
      '![Root causes](https://gist.github.com/user-attachments/assets/root-causes.png)',
      '',
      '<img src="https://gist.github.com/user-attachments/assets/final-state.png" alt="Final state" />'
    ].join('\n'));

    expect(blocks).toEqual([
      expect.objectContaining({
        imageAlt: 'Root causes',
        imageUrl: 'https://gist.github.com/user-attachments/assets/root-causes.png',
        text: 'Root causes'
      }),
      expect.objectContaining({
        imageAlt: 'Final state',
        imageUrl: 'https://gist.github.com/user-attachments/assets/final-state.png',
        text: 'Final state'
      })
    ]);
  });

  it('converts simple markdown tables into readable Medium list blocks', () => {
    const blocks = parseMarkdownToMediumBlocks([
      '| Mode | Result |',
      '| --- | --- |',
      '| MD5 | `44217.3 MH/s` |',
      '| NTLM | `69.6 GH/s` |'
    ].join('\n'));

    expect(blocks).toEqual([
      expect.objectContaining({
        type: 'ul-li',
        text: 'MD5: 44217.3 MH/s'
      }),
      expect.objectContaining({
        type: 'ul-li',
        text: 'NTLM: 69.6 GH/s'
      })
    ]);
  });
});

describe('buildParagraphDeltasFromBlocks', () => {
  it('translates block definitions into legacy delta payloads', () => {
    const deltas = buildParagraphDeltasFromBlocks([
      {
        type: 'h2',
        text: 'Section title'
      },
      {
        type: 'code',
        text: 'console.log("hi");',
        codeLang: 'js'
      }
    ]);

    expect(deltas).toEqual([
      {
        type: 1,
        index: 0,
        paragraph: {
          type: MEDIUM_PARAGRAPH_TYPES.h2,
          text: 'Section title',
          markups: []
        }
      },
      {
        type: 1,
        index: 1,
        paragraph: {
          type: MEDIUM_PARAGRAPH_TYPES.code,
          text: 'console.log("hi");',
          markups: [],
          codeLang: 'js'
        }
      }
    ]);
  });
});

describe('MediumRichDraftWriter', () => {
  it('initializes a blank draft and writes synthesized title/body blocks', async () => {
    const legacyClient = {
      createDraft: jest.fn().mockResolvedValue({
        data: {
          payload: {
            id: 'draft-1'
          }
        }
      }),
      getDraft: jest
        .fn()
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
                  subtitle: 'Subtitle line',
                  bodyModel: {
                    paragraphs: [{ text: 'Draft title' }, { text: 'Subtitle line' }, { text: 'Body text' }]
                  }
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
                latestRev: 1,
                title: '',
                content: {
                  bodyModel: {
                    paragraphs: [{ text: '' }]
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
                latestRev: 2,
                title: 'Draft title',
                content: {
                  bodyModel: {
                    paragraphs: [{ text: 'Draft title' }, { text: 'Subtitle line' }, { text: 'Body text' }]
                  }
                }
              }
            }
          }
        }),
      applyDeltas: jest
        .fn()
        .mockResolvedValueOnce({ data: { success: true } })
        .mockResolvedValueOnce({ data: { success: true } })
    } as any;

    const writer = new MediumRichDraftWriter(legacyClient);
    const result = await writer.createDraft({
      title: 'Draft title',
      subtitle: 'Subtitle line',
      markdown: 'Body text'
    });

    expect(result.postId).toBe('draft-1');
    expect(legacyClient.applyDeltas).toHaveBeenNthCalledWith(1, 'draft-1', -1, [{ type: 8, index: 0 }]);
    expect(legacyClient.applyDeltas).toHaveBeenNthCalledWith(
      2,
      'draft-1',
      1,
      [
        expect.objectContaining({
          index: 0,
          paragraph: expect.objectContaining({
            type: MEDIUM_PARAGRAPH_TYPES.h3,
            text: 'Draft title'
          })
        }),
        expect.objectContaining({
          index: 1,
          paragraph: expect.objectContaining({
            type: MEDIUM_PARAGRAPH_TYPES.subtitle,
            text: 'Subtitle line'
          })
        }),
        expect.objectContaining({
          index: 2,
          paragraph: expect.objectContaining({
            type: MEDIUM_PARAGRAPH_TYPES.paragraph,
            text: 'Body text'
          })
        })
      ]
    );
  });

  it('returns rendering warnings when raw markdown survives in non-code paragraphs', async () => {
    const legacyClient = {
      getDraft: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 1
              },
              normalizingDeltas: []
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: 'Subtitle',
                  bodyModel: {
                    paragraphs: [{ text: 'Title' }, { text: 'Subtitle' }, { text: 'Body text' }]
                  }
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
                latestRev: 1,
                title: '',
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
                latestRev: 2,
                title: 'Title',
                content: {
                  bodyModel: {
                    paragraphs: [
                      { type: 1, text: 'Title' },
                      { type: 1, text: 'Subtitle' },
                      { type: 1, text: 'Body with `raw` markdown' }
                    ]
                  }
                }
              }
            }
          }
        }),
      applyDeltas: jest.fn().mockResolvedValue({ data: { success: true } })
    } as any;

    const writer = new MediumRichDraftWriter(legacyClient);
    const result = await writer.writeDraft({
      postId: 'draft-2',
      title: 'Title',
      subtitle: 'Subtitle',
      blocks: [{ type: 'paragraph', text: 'Body text' }]
    });

    expect(result.renderingWarnings).toEqual([
      expect.objectContaining({
        code: 'raw_markdown_tokens_detected',
        index: 2
      })
    ]);
  });

  it('uploads gist images and writes them as Medium image paragraphs', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer
    } as any);

    const legacyClient = {
      getDraft: jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                latestRev: 1
              },
              normalizingDeltas: []
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            payload: {
              value: {
                previewContent: {
                  subtitle: null,
                  bodyModel: {
                    paragraphs: [{ text: 'Draft title' }, { text: 'Root causes' }]
                  }
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
                latestRev: 1,
                title: '',
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
                latestRev: 2,
                title: 'Draft title',
                content: {
                  bodyModel: {
                    paragraphs: [
                      { type: 1, text: 'Draft title' },
                      { type: 4, text: 'Root causes', metadata: { id: 'img-1' } }
                    ]
                  }
                }
              }
            }
          }
        }),
      applyDeltas: jest.fn().mockResolvedValue({ data: { success: true } }),
      uploadImageBuffer: jest.fn().mockResolvedValue({
        data: {
          payload: {
            value: {
              fileId: 'img-1',
              imgWidth: 1280,
              imgHeight: 720
            }
          }
        }
      })
    } as any;

    try {
      const writer = new MediumRichDraftWriter(legacyClient);
      await writer.writeDraft({
        postId: 'draft-3',
        title: 'Draft title',
        markdown: '![Root causes](https://gist.github.com/user-attachments/assets/root-causes.png)'
      });

      expect(global.fetch).toHaveBeenCalledWith('https://gist.github.com/user-attachments/assets/root-causes.png');
      expect(legacyClient.uploadImageBuffer).toHaveBeenCalled();
      expect(legacyClient.applyDeltas).toHaveBeenCalledWith(
        'draft-3',
        1,
        [
          expect.objectContaining({
            index: 0,
            paragraph: expect.objectContaining({
              type: MEDIUM_PARAGRAPH_TYPES.h3,
              text: 'Draft title'
            })
          }),
          expect.objectContaining({
            index: 1,
            paragraph: expect.objectContaining({
              type: 4,
              text: 'Root causes',
              metadata: expect.objectContaining({
                id: 'img-1',
                originalWidth: 1280,
                originalHeight: 720
              })
            })
          })
        ]
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
