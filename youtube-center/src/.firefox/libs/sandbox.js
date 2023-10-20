Cu.import("resource://gre/modules/Services.jsm");

var {getFirebugConsole} = require("utils");
var {sendRequest} = require("request");
var storage = require("storage");
var crossWindowLinker = require("crossWindowLinker");
var windowHandler = require("windowHandler");

function sandboxUnloader(win, sandbox) {
  crossWindowLinker.removeWindowListeners(win);
  
  if (sandbox) {
    try {
      if ("nukeSandbox" in Cu) {
        Cu.nukeSandbox(sandbox);
      } else {
        for (let v in sandbox) {
          try {
            sandbox[v] = null;
          } catch (e) {
            Cu.reportError(e);
          }
        }
      }
    } catch (e) {
      Cu.reportError(e);
    }
  }
  sandbox = null;
}

function createSandbox(wrappedContentWin) {
  let sandbox = new Cu.Sandbox(
    wrappedContentWin, {
      "sandboxName": "YouTube Center",
      "sandboxPrototype": wrappedContentWin,
      "wantXrays": true
    }
  );
  
  
  sandbox.createObjectIn = Cu.createObjectIn;
  sandbox.cloneInto = Cu.cloneInto;
  sandbox.exportFunction = Cu.exportFunction;
  
  sandbox.unsafeWindow = wrappedContentWin.wrappedJSObject;
  
  sandbox.request = sendRequest.bind(this, wrappedContentWin, sandbox);
  
  sandbox.storage_setValue = storage.setValue.bind(storage);
  sandbox.storage_getValue = storage.getValue.bind(storage);
  //sandbox.storage_listValues = storage.listValues.bind(storage);
  //sandbox.storage_exists = storage.exists.bind(storage);
  //sandbox.storage_remove = storage.remove.bind(storage);
  
  sandbox.addWindowListener = crossWindowLinker.addWindowListener.bind(crossWindowLinker, wrappedContentWin);
  sandbox.windowLinkerFireRegisteredEvent = crossWindowLinker.fireEvent.bind(crossWindowLinker, wrappedContentWin);

  // Make sure that everything is properly unloaded
  windowHandler.addEventListener(wrappedContentWin, "unload", sandboxUnloader.bind(this, wrappedContentWin, sandbox));
  
  return sandbox;
}

function isRunnable(url, whitelist, blacklist) {
  for (var i = 0; i < blacklist.length; i++) {
    if (blacklist[i].test(url + "/")) {
      return false;
    }
  }
  for (var i = 0; i < whitelist.length; i++) {
    if (whitelist[i].test(url + "/")) {
      return true;
    }
  }
  return false;
}

function embedCheck(url) {
  let settings = storage.getValue("YouTubeCenterSettings");
  if (settings && !settings.embed_enabled && /^http(s)?:\/\/(www\.)?youtube\.com\/embed\//.test(url)) {
    return false;
  }
  
  return true;
}

function load(content, sandbox, filename) {
  if (content.length > 0) {
    return Cu.evalInSandbox(content, sandbox, "ECMAv5", filename, 0);
  } else {
    return Services.scriptloader.loadSubScript(filename, sandbox, "UTF-8");
  }
}

function loadScript(whitelist, blacklist, filename, content, wrappedContentWin, url) {
  if (isRunnable(url, whitelist, blacklist) && embedCheck(url)) {
    let sandbox = createSandbox(wrappedContentWin);
    
    load(content, sandbox, filename);
  }
}

exports["loadScript"] = loadScript;