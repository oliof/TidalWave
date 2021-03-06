/// <reference path='../typings/node/node.d.ts' />

var _ = require('lodash');
var async = require('async');
var debug = require('debug')('Sync')
var util = require('livedb/lib/util');

import EmailHandler = require('./email-handler');
import options = require('./options-handler');
import log = require('./logger');

import model = require('./model');
var Page = model.Page;
var PageVersion = model.PageVersion;
var User = model.User;

var lastVersionDumped = {};
var backend = null;

var cName = 'sharejsdocuments';

export var init = function(backend_) {
  backend = backend_;
};

var dumpPageVersion = function(result, callback) {
  log.debug("IN DUMP PAGE VERSION");
  Page.findOne({
    _id: result.docName
  }, function(err, page) {
    log.debug("FOUND A PAGE");
    if (err) {
      log.error(err);
      callback(err);
      return;
    }
    if (page == null) {
      err = "ERROR: UPDATING PAGE THAT DOES NOT EXIST";
      log.error(err);
      callback(err);
      return;
    }
    if (page.content == result.data) {
      // The page hasn't changed between versions, don't make a new pageversion
      lastVersionDumped[result.docName] = result.v;
      callback();
      return;
    }

    var newPageVersion = new PageVersion({
      pageId: page._id,
      version: page.nextVersion,
      content: result.data,
      editorIds: []
    });
    log.debug("DUMPING " + page.name + " WITH VERSION " + page.nextVersion);
    page.nextVersion++;
    page.content = result.data;
    page.lastModifiedTime = newPageVersion.timestamp;
    console.log("TIMESTAMP: " + page.lastModifiedTime);
    page.save(function(err) {
      log.debug("SAVED PAGE");
      if (err) {
        log.error(err);
        callback(err);
        return;
      }
      log.debug("DUMPING PAGEVERSION");
      newPageVersion.save(function(err, innerPageVersion) {
        if (err) {
          log.error(err);
          callback(err);
          return;
        }
        lastVersionDumped[result.docName] = result.v;
        User.find({
          watchedPageIds: page._id
        }, function(err, users) {
          if (users.length > 0) {
            log.info({
              message: "Notifying watchers",
              watchers: users
            });
          }
          for (var i = 0; i < users.length; i++) {
            EmailHandler.sendMail(
              users[i].email,
              page.name + " has been updated.",
              "A friendly reminder that the page you watched, " + page.name + ", has been updated.  You can see the latest changes by going here: " + (options.ssl ? "https" : "http") + "://" + options.hostname + ":" + options.port + "/view/" + page.name);
          }
          log.debug("EXECUTING CALLBACK");
          callback();
        });
      });
    });
  });
};

export var fetch = function(docName, callback) {
  backend.fetch(cName, docName, function(error, result) {
    if (error) {
      log.error(error);
      callback(error);
      return;
    }
    callback(null, result);
  });
};

export var createDocument = function(docName, content, callback) {
  backend.submit(cName, docName, {create:{type:'text', data:null}}, function(err, version, transformedByOps, snapshot) {
    if (err) {
      callback(err);
      return;
    }
    backend.submit(cName, docName, {op:[content], v:1}, function(err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  });
};

export var sync = function(docName, callback) {
  if (!docName) {
    return;
  }
  //console.log("Checking for new versions");
  log.debug("PERFORMING SYNC");
  backend.fetch(cName, docName, function(error, result) {
    log.debug("LOOKING FOR DOCUMENT " + docName);
    if (result) {
      if (!(lastVersionDumped[result.docName] == result.v)) {
        log.debug("DUMPING NEW VERSION");
        log.debug(result);
        // Dump new PageVersion
        dumpPageVersion(result, callback);
        return;
      } else {
        // This version is the same as the last version
        callback();
        return;
      }
    } else {
      // Something went really wrong
      log.error("COULD NOT FIND DOCUMENT: " + docName);
      callback();
    }
  });
};
