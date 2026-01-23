module.exports = [
    {
        ignores: ['node_modules/**'],
    },
    // Server-side files
    {
        files: ['*.js', 'tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                // Node.js globals
                module: 'readonly',
                require: 'readonly',
                process: 'readonly',
                __dirname: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                clearTimeout: 'readonly',
                // Test globals
                describe: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
            },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-const-assign': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-empty': 'warn',
            'no-unreachable': 'error',
            'valid-typeof': 'error',
            'eqeqeq': ['warn', 'smart'],
            'no-eval': 'error',
            'semi': ['warn', 'always'],
            'quotes': ['warn', 'single', { avoidEscape: true }],
        },
    },
    // Browser-side files
    {
        files: ['public/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                // Browser globals
                document: 'readonly',
                window: 'readonly',
                localStorage: 'readonly',
                fetch: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                clearTimeout: 'readonly',
                Date: 'readonly',
                Math: 'readonly',
                Array: 'readonly',
                Object: 'readonly',
                String: 'readonly',
                // Socket.io
                io: 'readonly',
                // Game modules (loaded via script tags)
                KalasRandomChess: 'readonly',
                PIECES: 'readonly',
                PIECE_GLYPHS: 'readonly',
                ChessBoardUI: 'readonly',
                ChessAI: 'readonly',
                UI: 'readonly',
                Sounds: 'readonly',
                Auth: 'readonly',
                // Functions defined in main.js used by other files
                registerPlayerWithServer: 'readonly',
                joinTable: 'readonly',
                // Node.js for dual-environment files
                module: 'readonly',
            },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(PIECE_GLYPHS|PIECE_VALUES|Sounds|joinTable|startAIGame)$' }],
            'no-const-assign': 'error',
            'no-dupe-keys': 'error',
            'no-duplicate-case': 'error',
            'no-empty': 'warn',
            'no-unreachable': 'error',
            'valid-typeof': 'error',
            'eqeqeq': ['warn', 'smart'],
            'no-eval': 'error',
            'semi': ['warn', 'always'],
            'quotes': ['warn', 'single', { avoidEscape: true }],
        },
    },
];
