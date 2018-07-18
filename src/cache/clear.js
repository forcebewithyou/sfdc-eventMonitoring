var lo = require('lodash');
var fs = require('fs');
var moment = require('moment');
var path = require('path');
var process = require('process');
var Q = require('q');

var errorCodes = require('../lib/errorCodes.js');
var qutils = require('../lib/qutils.js');

/**
 * Deletes a single file
 * @param {string} file The file to delete
 * @returns {Promise} A promise for when the file is deleted
 */
function deleteFile(file) {
    var deferred = Q.defer();
    var filename = path.join(global.config.cache, file);

    global.logger.debug('Removing ' + filename);

    fs.unlink(filename, function (error) {
        qutils.rejectResolve(deferred, error, undefined);
    });

    return deferred.promise;
}

/**
 * Deletes a list of files
 * @param {string[]} files The files to delete
 * @returns {Promise} A promise for when the files are deleted
 */
function deleteFiles(files) {
    var deferred = Q.defer();
    var promises = [];
    var errors = [];

    global.logger.debug('Deleting ' + lo.size(files) + ' files from cache');

    lo.each(files, function (file) {
        promises.push(deleteFile(file));
    });

    Q.allSettled(promises)
        .then(function (results) {
            lo.forEach(results, function (result) {
                if (result.state !== 'fulfilled') {
                    errors.push(result.reason);
                }
            });

            qutils.rejectResolve(deferred, errors, undefined);
        });

    deferred.resolve();

    return deferred.promise;
}

/**
 * Gets all the files in the cache directory
 * @returns {Promise} A promise for when the file are found
 */
var getAllFiles = function () {
    var deferred = Q.defer();

    global.logger.debug('Fetching all files from cache dir ' + global.config.cache);

    fs.readdir(global.config.cache, function (error, files) {
        qutils.rejectResolve(deferred, error, files);
    });

    return deferred.promise;
};

/**
 * Gets files between two dates
 * @param {Moment} start The start time
 * @param {Moment} end The end time
 * @returns {Promise} A promise for a list of files
 */
var getFiles = function (start, end) {
    var deferred = Q.defer();
    var file_list = [];

    fs.readdir(global.config.cache, function (error, files) {
        if (error) {
            deferred.reject(error);
        } else {
            lo.forEach(files, function (file) {
                var m_date = moment.utc(parseInt(file.split('_')));
                if (m_date.isBetween(start, end, null, '[]')) {
                    file_list.push(file);
                }
            });

            deferred.resolve(file_list);
        }
    });

    return deferred.promise;
};

/**
 * The stuff to run
 * @returns {undefined}
 */
var run = function () {
    'use strict';

    if (global.config.cache === undefined) {
        global.logger.error('Cache options are not valid without cache folder being set');
        process.exit(errorCodes.NO_CACHE_DIR);
    }

    var action;

    if (
        global.config.start !== undefined ||
        global.config.end !== undefined ||
        global.config.date !== undefined
    ) {
        var m_start = moment.utc(0);
        var m_end = moment.utc();

        if (global.config.start !== undefined) {
            m_start = moment.utc(global.config.start);
        }

        if (global.config.end !== undefined) {
            m_end = moment.utc(global.config.end);
        }

        if (global.config.date !== undefined) {
            m_start = moment.utc(global.config.date).startOf('Day');
            m_end = moment.utc(global.config.date).endOf('Day');
        }

        action = getFiles(m_start, m_end);
    } else {
        action = getAllFiles();
    }

    action
        .then(deleteFiles)
        .catch(function (error) {
            global.logger.error(error);
        });
};

var cli = {run: run};

module.exports = cli;