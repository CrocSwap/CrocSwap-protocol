
module.exports = {
    skipFiles: ['test/', 'lens/'],
    configureYulOptimizer: true,

    mocha: {
        grep: "@gas-test",
        invert: true
    }
};
