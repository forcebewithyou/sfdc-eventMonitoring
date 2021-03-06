var bunyan = require('bunyan');
var ini = require('ini');
var fs = require('fs');
var lo = require('lodash');
var moment = require('moment');
var path = require('path');
var process = require('process');
var Q = require('q');

var pkg = require('../../package.json');
var errorCodes = require('./errorCodes.js');
var logging = require('./logging.js');
var statics_config = require('./statics/config.js');

var SOLENOPSIS_FIELDS = [
    'username',
    'password',
    'token',
    'url'
];

/**
 * Gets the environment variable name for home
 * @returns {string} The environment variable name
 */
var getHomeParam = function () {
    return process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
};

/**
 * Gets the user's home directory
 * @returns {string} The user's home directory
 */
var getUserHome = function () {
    return process.env[getHomeParam()];
};

/**
 * Gets the config file path
 * @returns {string} The path to the config file
 */
var getConfigPath = function () {
    return path.join(getUserHome(), '.eventmonitoring');
};

/**
 * Load the solenopsis credential file into the global config
 * @param {string} env The environment name to load
 * @returns {undefined}
 */
var loadSolenopsisCredentials = function (env) {
    var solenopsis_config_path = path.join(getUserHome(), '.solenopsis/credentials/', env + '.properties');

    var sol_config = ini.parse(fs.readFileSync(solenopsis_config_path, 'utf-8'));

    lo.merge(global.config, lo.pick(sol_config, SOLENOPSIS_FIELDS));
};

/**
 * Load the config from disk
 * @param {string} path_override The path to override if set
 * @returns {Promise} A promise for when the config has been loaded
 */
var loadConfig = function (path_override) {
    'use strict';

    var deferred = Q.defer();
    var config_path = path_override !== undefined ? path_override : getConfigPath();

    fs.readFile(config_path, function (error, data) {
        if (error) {
            if (error.code === 'ENOENT') {
                deferred.resolve();
            } else {
                deferred.reject(error);
            }
        } else {
            lo.merge(global.config, JSON.parse(data));
            deferred.resolve();
        }
    });

    return deferred.promise;
};

/**
 * Merge the global config with a given set of args
 * @param {object} args The args to merge in
 * @returns {undefined}
 */
var merge = function (args) {
    lo.merge(global.config, args);
};

/**
 * Loads the helper methods
 * @returns {Promise} A promise for when the helper method is loaded
 */
var loadHelper = function () {
    var deferred = Q.defer();

    if (global.config.helper === undefined) {
        global.logger.debug('No helper defined');
        deferred.resolve();
    } else {
        fs.stat(global.config.helper, function (error) {
            if (!error) {
                global.helper = require(global.config.helper); // eslint-disable-line global-require
                global.logger.debug('Loading "' + global.config.helper + '"');
            } else {
                global.logger.debug('Unable to load "' + global.config.helper + '" (' + error.code + ')');
            }

            deferred.resolve();
        });
    }

    return deferred.promise;
};

/**
 * Gets if the log format meets the expected format
 * @param {string} expectedFormat The expected format
 * @returns {boolean} If the logformat matches
 */
var isLogFormat = function (expectedFormat) {
    return global.config.logformat === expectedFormat;
};

/**
 * Gets if we are using bunyan logging
 * @returns {boolean} If we are using bunyan
 */
var isBunyanLogging = function () {
    return isLogFormat('bunyan');
};

/**
 * Sets up the logger function
 * @returns {undefined}
 */
var setupLogger = function () {
    if (isBunyanLogging()) {
        var stream = { level: 'info' };

        if (global.config.debug) {
            stream.level = 'debug';
        }

        if (global.config.logfile !== undefined) {
            stream.path = global.config.logfile;
        } else {
            stream.stream = process.stdout;
        }

        global.loggerfunction = bunyan.createLogger({
            name: pkg.name,
            streams: [ stream ]
        });

        return;
    }

    global.loggerfunction = console;
};

/**
 * Sets up any additional global variables we need
 * @returns {Promise} A promise for when the setup is complete
 */
var setupGlobals = function () {
    var deferred = Q.defer();
    var promises = [];

    promises.push(loadHelper());

    Q.allSettled(promises)
        .then(function () {
            deferred.resolve();
        });

    return deferred.promise;
};

/**
 * Returns if any of the variables passed in are undefined
 * @param {string|string[]} keys The keys to check
 * @return {boolean} If any of the keys are undefined
 */
var isUndefined = function (keys) {
    var anyWereUndefined = false;
    if (lo.isArray(keys)) {
        lo.forEach(keys, function (key) {
            if (lo.isUndefined(lo.get(global.config, key))) {
                anyWereUndefined = true;
            }
        });

        return anyWereUndefined;
    }

    return lo.isUndefined(lo.get(global.config, keys));
};

/**
 * Checks to see if the requested handler is available
 * @param {object} handlers The available handlers
 * @param {string} handler_key The key in the config to use
 * @returns {undefined}
 */
var checkHandlers = function (handlers, handler_key) {
    var handler_name = lo.isUndefined(handler_key) ? 'type' : handler_key;
    var fnname = lo.get(global.config, handler_name);
    if (
        !lo.has(handlers, fnname) ||
        lo.get(handlers, fnname) === undefined
    ) {
        logging.logAndExit(fnname + ' does not have a supported handler', errorCodes.UNSUPPORTED_HANDLER);
    }
};

/**
 * Logs in and runs the specified handler
 * @param {object} args The arguments passed to the method
 * @param {object} handlers The handlers
 * @param {function} login The login method
 * @returns {undefined}
 */
var loginAndRunHandler = function (args, handlers, login) {
    var deferred = Q.defer();

    merge(args);

    checkHandlers(handlers);

    login()
        .then(function () {
            lo.get(handlers, global.config.type)();
        })
        .then(function () {
            deferred.resolve();
        })
        .catch(function (error) {
            logging.logError(error);
            deferred.reject(error);
        });

    return deferred.promise;
};

/**
 * Gets a moment version of the end date
 * @returns {object} The end date
 */
var getEnd = function () {
    var m_end = moment.utc();

    if (!config.isUndefined('end')) {
        m_end = moment.utc(global.config.end);
    }

    if (!config.isUndefined('date')) {
        m_end = moment.utc(global.config.date).endOf('Day');
    }

    return m_end;
};

/**
 * Gets a moment version of the start date
 * @returns {object} The start date
 */
var getStart = function () {
    var m_start = moment.utc(0);

    if (!config.isUndefined('start')) {
        m_start = moment.utc(global.config.start);
    }

    if (!config.isUndefined('date')) {
        m_start = moment.utc(global.config.date).startOf('Day');
    }

    return m_start;
};

/**
 * Do we have dates to act on
 * @returns {boolean} If we have dates
 */
var hasADate = function () {
    return (
        global.config.start !== undefined ||
        global.config.end !== undefined ||
        global.config.date !== undefined
    );
};

/**
 * Configure yargs
 * @param {object} yargs Instance of yargs
 * @param {string} positional The positional data
 * @param {object} options The options
 * @returns {undefined}
 */
var yargsConfig = function (yargs, positional, options) {
    if (!lo.isUndefined(positional)) {
        var pdata_array = [];

        if (lo.isArray(positional)) {
            pdata_array = positional;
        } else {
            pdata_array.push(positional);
        }

        lo.forEach(pdata_array, function (pdata) {
            yargs.positional(pdata.name, pdata.options);
        });
    }

    yargs.options(options);
};

/**
 * Generates the pdata object
 * @param {string} name The field name
 * @param {string} description The field description
 * @param {object[]} handlers The handlers
 * @returns {object} The pdata object
 */
var yargsGeneratePdata = function (name, description, handlers) {
    return {
        name: name,
        options: {
            type: 'string',
            description: description,
            choices: lo.keys(handlers)
        }
    };
};

/**
 * Generates the pdata object for 'type'
 * @param {string} description The field description
 * @param {object[]} handlers The handlers
 * @returns {object} The pdata object
 */
var yargsGenerateTypePdata = function (description, handlers) {
    return yargsGeneratePdata('type', description, handlers);
};

/**
 * Generate options object
 * @param {string[]} keys The option keys
 * @return {object} The option object
 */
var yargsGenerateOptions = function (keys) {
    var options = {};

    lo.forEach(keys, function (key) {
        if (lo.has(statics_config, key)) {
            lo.set(options, key, lo.get(statics_config, key));
        }
    });

    return options;
};

/**
 * If our output is suppose to be JSON
 * @return {Boolean} If we're outputting JSON
 */
var isJSON = function () {
    return global.config.format === 'json';
};

/**
 * If our output is suppose to be JSON
 * @return {Boolean} If we're outputting JSON
 */
var isTable = function () {
    return global.config.format === 'table';
};

var config = {
    checkHandlers: checkHandlers,
    date: {
        getEnd: getEnd,
        getStart: getStart,
        hasADate: hasADate
    },
    functions: {
        getConfigPath: getConfigPath,
        getHomeParam: getHomeParam,
        getUserHome: getUserHome,
        loadHelper: loadHelper,
        isLogFormat: isLogFormat,
        isBunyanLogging: isBunyanLogging
    },
    isJSON: isJSON,
    isTable: isTable,
    isUndefined: isUndefined,
    loadSolenopsisCredentials: loadSolenopsisCredentials,
    loadConfig: loadConfig,
    loginAndRunHandler: loginAndRunHandler,
    merge: merge,
    setupGlobals: setupGlobals,
    setupLogger: setupLogger,
    yargs: {
        config: yargsConfig,
        generateOptions: yargsGenerateOptions,
        generatePdata: yargsGeneratePdata,
        generateTypePdata: yargsGenerateTypePdata
    }
};

module.exports = config;