/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

var express = require("express");
var path = require('path');

var comms = require("./comms");
var library = require("./library");
var info = require("./settings");

var auth = require("../auth");
var nodes = require("../admin/nodes"); // TODO: move /icons into here
var needsPermission;
var runtimeAPI;
var log = require("../../util").log; // TODO: separate module
var i18n = require("../../util").i18n; // TODO: separate module

var apiUtil = require("../util");

var ensureRuntimeStarted = function(req,res,next) {
    runtimeAPI.isStarted().then( started => {
        if (!started) {
            log.error("Node-RED runtime not started");
            res.status(503).send("Not started");
        } else {
            next()
        }
    })
}

module.exports = {
    init: function(server, settings, _runtimeAPI) {
        runtimeAPI = _runtimeAPI;
        needsPermission = auth.needsPermission;
        if (!settings.disableEditor) {
            info.init(runtimeAPI);
            comms.init(server,settings,runtimeAPI);

            var ui = require("./ui");

            ui.init(runtimeAPI);

            var editorApp = express();
            if (settings.requireHttps === true) {
                editorApp.enable('trust proxy');
                editorApp.use(function (req, res, next) {
                    if (req.secure) {
                        next();
                    } else {
                        res.redirect('https://' + req.headers.host + req.originalUrl);
                    }
                });
            }
            editorApp.get("/",ensureRuntimeStarted,ui.ensureSlash,ui.editor);

            editorApp.get("/icons",needsPermission("nodes.read"),nodes.getIcons,apiUtil.errorHandler);
            editorApp.get("/icons/:module/:icon",ui.icon);
            editorApp.get("/icons/:scope/:module/:icon",ui.icon);

            var theme = require("./theme");
            theme.init(settings);
            editorApp.use("/theme",theme.app());
            editorApp.use("/",ui.editorResources);

            //Projects
            var projects = require("./projects");
            projects.init(runtimeAPI);
            editorApp.use("/projects",projects.app());

            // Locales
            var locales = require("./locales");
            locales.init(runtimeAPI);
            editorApp.get(/locales\/(.+)\/?$/,locales.get,apiUtil.errorHandler);

            // Library
            var library = require("./library");
            library.init(runtimeAPI);
            editorApp.get("/library/flows",needsPermission("library.read"),library.getAll,apiUtil.errorHandler);
            editorApp.get(/library\/([^\/]+)(?:$|\/(.*))/,needsPermission("library.read"),library.getEntry);
            editorApp.post(/library\/([^\/]+)\/(.*)/,needsPermission("library.write"),library.saveEntry);


            // Credentials
            var credentials = require("./credentials");
            credentials.init(runtimeAPI);
            editorApp.get('/credentials/:type/:id', needsPermission("credentials.read"),credentials.get,apiUtil.errorHandler);

            // Settings
            editorApp.get("/settings",needsPermission("settings.read"),info.runtimeSettings,apiUtil.errorHandler);
            // User Settings
            editorApp.get("/settings/user",needsPermission("settings.read"),info.userSettings,apiUtil.errorHandler);
            // User Settings
            editorApp.post("/settings/user",needsPermission("settings.write"),info.updateUserSettings,apiUtil.errorHandler);
            // SSH keys
            editorApp.use("/settings/user/keys",needsPermission("settings.write"),info.sshkeys());

            return editorApp;
        }
    },
    start: function() {
        var catalogPath = path.resolve(path.join(__dirname,"locales"));
        return i18n.registerMessageCatalogs([
            {namespace: "editor",   dir: catalogPath, file:"editor.json"},
            {namespace: "jsonata",  dir: catalogPath, file:"jsonata.json"},
            {namespace: "infotips", dir: catalogPath, file:"infotips.json"}
        ]).then(function(){
            comms.start();
        });
    },
    stop: comms.stop
}
