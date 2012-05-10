"use strict";

var util = require("util");
var ShellRunner = require("../cloud9.run.shell/shell").Runner;

/**
 * Run node scripts with restricted user rights
 */

var exports = module.exports = function setup(options, imports, register) {
    var pm = imports["process-manager"];

    pm.addRunner("npm", exports.factory(imports.vfs));

    register(null, {
        "run-npm": {}
    });
};

exports.factory = function(vfs) {
    return function(args, eventEmitter, eventName) {
        return new Runner(vfs, args.args, args.cwd, args.nodeVersion, args.extra, eventEmitter, eventName);
    };
};

var Runner = exports.Runner = function(vfs, args, cwd, nodeVersion, extra, eventEmitter, eventName) {
    ShellRunner.call(this, vfs, "npm", args, cwd, {}, extra, eventEmitter, eventName);
};

util.inherits(Runner, ShellRunner);

Runner.prototype.name = "npm";