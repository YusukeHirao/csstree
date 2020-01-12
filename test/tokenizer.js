const assert = require('assert');
const { tokenize } = require('../lib');
const Raw = require('../lib/syntax/node/Raw'); // FIXME: do not refer to Raw
const fixture = require('./fixture/tokenize');

describe('parser/stream', () => {
    const css = '.test\n{\n  prop: url(foo/bar.jpg) url( a\\(\\33 \\).\\ \\"\\\'test ) calc(1 + 1) \\x \\aa ;\n}';
    const tokens = [
        { type: 'Delim', chunk: '.', balance: 83 },
        { type: 'Ident', chunk: 'test', balance: 83 },
        { type: 'WhiteSpace', chunk: '\n', balance: 83 },
        { type: 'LeftCurlyBracket', chunk: '{', balance: 25 },
        { type: 'WhiteSpace', chunk: '\n  ', balance: 25 },
        { type: 'Ident', chunk: 'prop', balance: 25 },
        { type: 'Colon', chunk: ':', balance: 25 },
        { type: 'WhiteSpace', chunk: ' ', balance: 25 },
        { type: 'Url', chunk: 'url(foo/bar.jpg)', balance: 25 },
        { type: 'WhiteSpace', chunk: ' ', balance: 25 },
        { type: 'Url', chunk: 'url( a\\(\\33 \\).\\ \\"\\\'test )', balance: 25 },
        { type: 'WhiteSpace', chunk: ' ', balance: 25 },
        { type: 'Function', chunk: 'calc(', balance: 18 },
        { type: 'Number', chunk: '1', balance: 18 },
        { type: 'WhiteSpace', chunk: ' ', balance: 18 },
        { type: 'Delim', chunk: '+', balance: 18 },
        { type: 'WhiteSpace', chunk: ' ', balance: 18 },
        { type: 'Number', chunk: '1', balance: 18 },
        { type: 'RightParenthesis', chunk: ')', balance: 12 },
        { type: 'WhiteSpace', chunk: ' ', balance: 25 },
        { type: 'Ident', chunk: '\\x', balance: 25 },
        { type: 'WhiteSpace', chunk: ' ', balance: 25 },
        { type: 'Ident', chunk: '\\aa ', balance: 25 },
        { type: 'Semicolon', chunk: ';', balance: 25 },
        { type: 'WhiteSpace', chunk: '\n', balance: 25 },
        { type: 'RightCurlyBracket', chunk: '}', balance: 3 }
    ];
    const dump = tokens.map(({ type, chunk, balance }, idx) => ({
        idx,
        type,
        chunk,
        balance
    }));
    const types = tokens.map(token => token.type);
    const start = tokens.map(function(token) {
        const start = this.offset;
        this.offset += token.chunk.length;
        return start;
    }, { offset: 0 });
    const end = tokens.map(function(token) {
        this.offset += token.chunk.length;
        return this.offset;
    }, { offset: 0 });

    it('edge case: no arguments', () => {
        const stream = tokenize();

        assert.equal(stream.eof, true);
        assert.equal(stream.tokenType, 0);
        assert.equal(stream.source, '');
    });

    it('edge case: empty input', () => {
        const stream = tokenize('');

        assert.equal(stream.eof, true);
        assert.equal(stream.tokenType, 0);
        assert.equal(stream.source, '');
    });

    it('should convert input to string', () => {
        const stream = tokenize({
            toString: () => {
                return css;
            }
        });

        assert.equal(stream.source, css);
    });

    it('should accept a Buffer', () => {
        const stream = tokenize(Buffer.from(css));

        assert.equal(stream.source, css);
    });

    it('dump()', () => {
        const stream = tokenize(css);

        assert.deepEqual(stream.dump(), dump);
    });

    it('next() types', () => {
        const stream = tokenize(css);
        const actual = [];

        while (!stream.eof) {
            actual.push(tokenize.NAME[stream.tokenType]);
            stream.next();
        }

        assert.deepEqual(actual, types);
    });

    it('next() start', () => {
        const stream = tokenize(css);
        const actual = [];

        while (!stream.eof) {
            actual.push(stream.tokenStart);
            stream.next();
        }

        assert.deepEqual(actual, start);
    });

    it('next() end', () => {
        const stream = tokenize(css);
        const actual = [];

        while (!stream.eof) {
            actual.push(stream.tokenEnd);
            stream.next();
        }

        assert.deepEqual(actual, end);
    });

    it('skip()', () => {
        const stream = tokenize(css);
        const targetTokens = tokens.filter(token =>
            token.type === 'Ident' || token.type === 'Delim'
        );
        const actual = targetTokens
            .map(function(token, idx, idents) {
                return idx ? tokens.indexOf(token) - tokens.indexOf(idents[idx - 1]) : tokens.indexOf(token);
            })
            .map(function(skip) {
                stream.skip(skip);
                return tokenize.NAME[stream.tokenType];
            });

        assert.equal(actual.length, 6); // 4 x Indentifier + 2 x Delim
        assert.deepEqual(actual, targetTokens.map(token => token.type));
    });

    it('skip() to end', () => {
        const stream = tokenize(css);

        stream.skip(tokens.length);

        assert.equal(stream.eof, true);
    });

    describe('Raw', () => {
        /* eslint-disable key-spacing */
        const tests = [
            {
                source: '? { }',
                start:  '^',
                skip:   '^',
                mode: Raw.mode.leftCurlyBracket,
                expected: '? '
            },
            {
                // issues #56
                source: 'div { }',
                start:  '^',
                skip:   '^',
                mode: Raw.mode.leftCurlyBracket,
                expected: 'div '
            },
            {
                source: 'foo(bar(1)(2)(3[{}])(4{}){}(5))',
                start:  '             ^',
                skip:   '             ^',
                mode: Raw.mode.leftCurlyBracket,
                expected: '(3[{}])(4{})'
            },
            {
                source: 'foo(bar(1) (2) (3[{}]) (4{}) {} (5))',
                start:  '               ^',
                skip:   '                ^',
                mode: Raw.mode.leftCurlyBracket,
                expected: '(3[{}]) (4{}) '
            },
            {
                source: 'func(a func(;))',
                start:  '     ^',
                skip:   '       ^',
                mode: Raw.mode.semicolonIncluded,
                expected: 'a func(;)'
            },
            {
                source: 'func(a func(;))',
                start:  '     ^',
                skip:   '            ^',
                mode: Raw.mode.semicolonIncluded,
                expected: 'a func(;)'
            },
            {
                source: 'func(a func(;); b)',
                start:  '     ^',
                skip:   '       ^',
                mode: Raw.mode.semicolonIncluded,
                expected: 'a func(;);'
            },
            {
                source: 'func()',
                start:  '     ^',
                skip:   '     ^',
                mode: null,
                expected: ''
            },
            {
                source: 'func([{}])',
                start:  '      ^',
                skip:   '       ^',
                mode: null,
                expected: '{}'
            },
            {
                source: 'func([{})',
                start:  '     ^',
                skip:   '      ^',
                mode: null,
                expected: '[{})'
            },
            {
                source: 'func(1, 2, 3) {}',
                start:  '^',
                skip:   '      ^',
                mode: null,
                expected: 'func(1, 2, 3) {}'
            }
        ];

        tests.forEach(function(test, idx) {
            it('testcase#' + idx, () => {
                const stream = tokenize(test.source);
                const startOffset = test.start.indexOf('^');
                const skipToOffset = test.skip.indexOf('^');
                let startToken = stream.tokenIndex;

                while (stream.tokenStart < startOffset) {
                    stream.next();
                    startToken = stream.tokenIndex;
                }

                while (stream.tokenStart < skipToOffset) {
                    stream.next();
                }

                stream.skip(stream.getRawLength(startToken, test.mode || Raw.mode.default));
                assert.equal(
                    stream.source.substring(startOffset, stream.tokenStart),
                    test.expected
                );
            });
        });
    });

    it('dynamic buffer', () => {
        const bufferSize = tokenize(css).offsetAndType.length + 10;
        const stream = tokenize('.'.repeat(bufferSize));
        let count = 0;

        while (!stream.eof) {
            count++;
            stream.next();
        }

        assert.equal(count, bufferSize);
        assert(stream.offsetAndType.length >= bufferSize);
    });

    describe('values', () => {
        ['valid', 'invalid'].forEach(testType => {
            fixture.forEachTest(testType, (name, value, tokens) => {
                it(name, () => {
                    assert[testType === 'valid' ? 'deepEqual' : 'notDeepEqual'](
                        tokenize(value).dump().map(token => ({
                            type: token.type,
                            chunk: token.chunk
                        })),
                        tokens
                    );
                });
            });
        });
    });
});
