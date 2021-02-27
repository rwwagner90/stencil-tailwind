'use strict';

var debug$1 = require('debug');
var chalk = require('chalk');
var path = require('path');
var postcss = require('postcss');
var tailwindcss = require('tailwindcss');
var MagicString = require('magic-string');
var walk = require('acorn-walk');
var fs = require('fs');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var postcss__default = /*#__PURE__*/_interopDefaultLegacy(postcss);
var tailwindcss__default = /*#__PURE__*/_interopDefaultLegacy(tailwindcss);
var MagicString__default = /*#__PURE__*/_interopDefaultLegacy(MagicString);
var walk__default = /*#__PURE__*/_interopDefaultLegacy(walk);

const NAMESPACE = 'stencil-tw';
var debug = {
    time: debug$1.debug(`${NAMESPACE}:t`),
    log: debug$1.debug(NAMESPACE),
    red: (...args) => debug$1.debug(NAMESPACE)(chalk.red(args)),
    green: (...args) => debug$1.debug(NAMESPACE)(chalk.green(args)),
    blue: (...args) => debug$1.debug(NAMESPACE)(chalk.blue(args)),
    yellow: (...args) => debug$1.debug(NAMESPACE)(chalk.yellow(args))
};

async function _transformSass(code) {
    const match = /(.* = ")(.*)(";[\s|\S]*)/.exec(code);
    const transformedStyles = await postcss__default['default']([tailwindcss__default['default']()])
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
        const s = new MagicString__default['default'](code);
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
    walk__default['default'].simple(node, {
        Property(prop) {
            var _a;
            if (((_a = prop === null || prop === void 0 ? void 0 : prop.key) === null || _a === void 0 ? void 0 : _a.name) === 'class') {
                walk__default['default'].simple(prop === null || prop === void 0 ? void 0 : prop.value, {
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
    walk__default['default'].simple(node, {
        CallExpression(ce) {
            var _a;
            if (((_a = ce.callee) === null || _a === void 0 ? void 0 : _a.name) === '__decorate') {
                walk__default['default'].simple(ce, {
                    Literal(lit) {
                        walk__default['default'].simple(node, {
                            AssignmentExpression(ae) {
                                var _a;
                                if (((_a = ae.left.property) === null || _a === void 0 ? void 0 : _a.name) === lit.value) {
                                    walk__default['default'].simple(ae.right.body, {
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

const { readFile } = fs.promises;
let postcssRoot;
function tailwind(opts) {
    const options = _buildOptions(opts);
    return {
        name: 'tailwind',
        async buildStart() {
            debug.time('build start');
            return readFile(options.inputFile).then(async (css) => postcss__default['default']([options.tailwind])
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
        tailwind: tailwindcss__default['default'](),
        inputFile: path__default['default'].join(__dirname, '/app.css'),
        includeTailwindCss: true
    };
    return Object.assign({}, defaults, opts);
}

module.exports = tailwind;
