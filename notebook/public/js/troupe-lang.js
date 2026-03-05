import { StreamLanguage } from '@codemirror/language';

const KEYWORDS = new Set([
    "let", "in", "end", "val", "fun", "and",
    "if", "then", "else", "case", "of",
    "fn", "hn", "when", "with",
    "import", "qualified", "as",
    "datatype", "Atoms", "pini"
]);

const OP_KEYWORDS = new Set([
    "andalso", "orelse", "not",
    "div", "mod", "andb", "orb", "xorb"
]);

const BUILTINS = new Set([
    "raisedTo", "isTuple", "isList", "isRecord"
]);

const troupeStreamParser = {
    name: "troupe",

    startState() {
        return { commentDepth: 0, inDCLabel: false };
    },

    copyState(state) {
        return { commentDepth: state.commentDepth, inDCLabel: state.inDCLabel };
    },

    token(stream, state) {
        // Priority 1: Inside nested comment
        if (state.commentDepth > 0) {
            while (!stream.eol()) {
                if (stream.match("(*")) {
                    state.commentDepth++;
                } else if (stream.match("*)")) {
                    state.commentDepth--;
                    if (state.commentDepth === 0) return "comment";
                } else {
                    stream.next();
                }
            }
            return "comment";
        }

        // Priority 2: Single-line comment (*)...
        if (stream.match("(*)")) {
            stream.skipToEnd();
            return "comment";
        }

        // Priority 3: Nested comment start
        if (stream.match("(*")) {
            state.commentDepth = 1;
            while (!stream.eol()) {
                if (stream.match("(*")) {
                    state.commentDepth++;
                } else if (stream.match("*)")) {
                    state.commentDepth--;
                    if (state.commentDepth === 0) return "comment";
                } else {
                    stream.next();
                }
            }
            return "comment";
        }

        // Priority 4: Whitespace
        if (stream.eatSpace()) return null;

        // Priority 5: Strings
        if (stream.peek() === '"') {
            stream.next();
            while (!stream.eol()) {
                const ch = stream.next();
                if (ch === '"') return "string";
            }
            return "string";
        }

        // Priority 6: Backtick-brace labels `{...}`
        if (stream.match(/^`\{/)) {
            while (!stream.eol()) {
                if (stream.match(/^\}`/)) return "atom";
                stream.next();
            }
            return "atom";
        }

        // Priority 7: DC label open `<
        if (stream.match(/^`\s*</)) {
            state.inDCLabel = true;
            return "meta";
        }

        // Priority 8: DC label close >`
        if (state.inDCLabel && stream.match(/^>\s*`/)) {
            state.inDCLabel = false;
            return "meta";
        }

        // Priority 9: DC label special keywords (#-prefixed)
        if (stream.match("#root-confidentiality") || stream.match("#root-integrity") ||
            stream.match("#null-confidentiality") || stream.match("#null-integrity")) {
            return "atom";
        }
        if (stream.match("#true") || stream.match("#false")) {
            return "atom";
        }

        // Priority 10: Float literals (before integers)
        if (stream.match(/^[0-9][_0-9]*\.[0-9][_0-9]*([eE][+-]?[0-9][_0-9]*)?/)) {
            return "number";
        }

        // Priority 11: Integer literals
        if (stream.match(/^0[bB][01][_01]*/)) return "number";
        if (stream.match(/^0[oO][0-7][_0-7]*/)) return "number";
        if (stream.match(/^0[xX][0-9a-fA-F][_0-9a-fA-F]*/)) return "number";
        if (stream.match(/^[0-9][_0-9]*/)) return "number";

        // Priority 12: Multi-character operators (longest first)
        if (stream.match("~>>")) return "operator";
        if (stream.match("<<")) return "operator";
        if (stream.match(">>")) return "operator";
        if (stream.match("=>")) return "operator";
        if (stream.match("<>")) return "operator";
        if (stream.match("<=")) return "operator";
        if (stream.match(">=")) return "operator";
        if (stream.match("::")) return "operator";
        if (stream.match("..")) return "operator";

        // Priority 13: Identifiers and keywords
        if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_']*/)) {
            const word = stream.current();
            if (word === "true" || word === "false") return "atom";
            if (KEYWORDS.has(word)) return "keyword";
            if (OP_KEYWORDS.has(word)) return "operator";
            if (BUILTINS.has(word)) return "builtin";
            return null;
        }

        // Priority 14: Single-character operators
        const ch = stream.peek();
        if ("+-*/^=<>@&|".includes(ch)) {
            stream.next();
            return "operator";
        }

        // Priority 15: Punctuation and brackets
        if ("()[]{}".includes(ch)) {
            stream.next();
            return "paren";
        }
        if (",;._".includes(ch)) {
            stream.next();
            return "punctuation";
        }

        // Priority 16: Fallback
        stream.next();
        return null;
    },

    languageData: {
        commentTokens: { block: { open: "(*", close: "*)" } }
    }
};

export const troupeLanguage = StreamLanguage.define(troupeStreamParser);

export function troupe() {
    return troupeLanguage;
}
