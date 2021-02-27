import { debug as debug$1 } from 'debug';
import { red, green, blue, yellow } from 'chalk';
import path from 'path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import MagicString from 'magic-string';
import walk from 'acorn-walk';
import { promises } from 'fs';

const NAMESPACE = 'stencil-tw';
var debug = {
    time: debug$1(`${NAMESPACE}:t`),
    log: debug$1(NAMESPACE),
    red: (...args) => debug$1(NAMESPACE)(red(args)),
    green: (...args) => debug$1(NAMESPACE)(green(args)),
    blue: (...args) => debug$1(NAMESPACE)(blue(args)),
    yellow: (...args) => debug$1(NAMESPACE)(yellow(args))
};

async function _transformSass(code) {
    const match = /(.* = ")(.*)(";[\s|\S]*)/.exec(code);
    const transformedStyles = await postcss([tailwindcss()])
        .process(match[2].replace(/\(\\"/g, '("').replace(/\\"\)/g, '")').replace(/\\n/g, ''))
        .then(result => match[1] + result.toString() + match[3]);
    return {
        code: transformedStyles.replace(/[\n\r]*/g, '')
    };
}

function transformTsx(code, node, cssRoot) {
    let match = /= (.*?Style);/.exec(code);
    if (match) {
        debug.red('transformTsx:code:\n', code);
        const s = new MagicString(code);
        const utilityClasses = _buildTailwindClassList(node, cssRoot);
        if (utilityClasses) {
            s.overwrite(match.index, match.index + match[1].length + 2, `= \`${utilityClasses} \${${match[1]}}\``);
        }
        return {
            code: s.toString().replace(/\\:/g, '\\\\:')
        };
    }
}
function _buildTailwindClassList(node, cssRoot) {
    var _a;
    const classes = _parseClasses(node);
    if (classes.length) {
        return (_a = cssRoot === null || cssRoot === void 0 ? void 0 : cssRoot.nodes) === null || _a === void 0 ? void 0 : _a.filter(isRule).reduce((acc, rule) => {
            const match = rule.selector.replace(/\\/, '').match(/([a-zA-Z0-9-]+$|[a-zA-Z0-9-]+:[a-zA-Z0-9-]+)/);
            if (match && classes.includes(match[0])) {
                return rule.toString().replace(/\s+/gm, ' ') + ' \\n' + acc;
            }
            return acc;
        }, '');
    }
}
function _parseClasses(node) {
    return _parseStyleDecorator(node).concat(_parseInlineClasses(node));
}
function _parseInlineClasses(node) {
    let result = [];
    walk.simple(node, {
        Property(prop) {
            var _a;
            if (((_a = prop === null || prop === void 0 ? void 0 : prop.key) === null || _a === void 0 ? void 0 : _a.name) === 'class') {
                walk.simple(prop === null || prop === void 0 ? void 0 : prop.value, {
                    Literal(n) {
                        result = result.concat(_trimSizingDslSyntax(n.value).split(' '));
                    }
                });
            }
        }
    });
    return result;
}
function _parseStyleDecorator(node) {
    let result = [];
    walk.simple(node, {
        CallExpression(ce) {
            var _a;
            if (((_a = ce.callee) === null || _a === void 0 ? void 0 : _a.name) === '__decorate') {
                walk.simple(ce, {
                    Literal(lit) {
                        walk.simple(node, {
                            AssignmentExpression(ae) {
                                var _a;
                                if (((_a = ae.left.property) === null || _a === void 0 ? void 0 : _a.name) === lit.value) {
                                    walk.simple(ae.right.body, {
                                        Property(prop) {
                                            result = result.concat(_trimSizingDslSyntax(prop.key.value).split(' '));
                                        }
                                    });
                                }
                            }
                        });
                    }
                });
            }
        },
    });
    return result;
}
function _trimSizingDslSyntax(s) {
    return s.toString().replace(/\S+<|[<>]/gm, '');
}
function isRule(node) {
    return node.selector !== undefined;
}

const { readFile } = promises;
let postcssRoot;
function tailwind(opts) {
    const options = _buildOptions(opts);
    return {
        name: 'tailwind',
        async buildStart() {
            debug.time('build start');
            return readFile(options.inputFile).then(async (css) => postcss([options.tailwind])
                .process(css, { from: options.inputFile })
                .then(async (result) => {
                debug.time('style tree built');
                if (options.includeTailwindCss) {
                    this.emitFile({
                        type: 'asset',
                        source: result.toString(),
                        fileName: 'tailwind.css'
                    });
                }
                postcssRoot = result.root;
            }));
        },
        async transform(sourceText, fileName) {
            if (fileName.match(/\.s?css/)) {
                return await _transformSass(sourceText);
            }
            else if (fileName.includes('.tsx')) {
                return transformTsx(sourceText, this.parse(sourceText, {}), postcssRoot);
            }
        },
    };
}
function _buildOptions(opts) {
    const defaults = {
        tailwind: tailwindcss(),
        inputFile: path.join(__dirname, '/app.css'),
        includeTailwindCss: true
    };
    return Object.assign({}, defaults, opts);
}

export default tailwind;
