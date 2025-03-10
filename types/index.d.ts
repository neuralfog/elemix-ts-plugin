import * as ts from 'typescript';
import * as tsServer from 'typescript/lib/tsserverlibrary.js';
declare function init({ typescript, }: {
    typescript: typeof ts;
}): tsServer.server.PluginModule;
export = init;
