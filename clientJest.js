// jest.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
    displayName: 'client',

    // NOTE: if you don't set this correctly then when you reference
    // it later in a path string you'll get a confusing error message.
    // It says something like' Module <rootDir>/config/polyfills.js in
    // the setupFiles option was not found.'
    testEnvironment: 'jest-environment-jsdom',

    testMatch: [
        "**/client/**/?(*.)+(spec|test).[jt]s?(x)"
    ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);