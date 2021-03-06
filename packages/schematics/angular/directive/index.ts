/**
* @license
* Copyright Google Inc. All Rights Reserved.
*
* Use of this source code is governed by an MIT-style license that can be
* found in the LICENSE file at https://angular.io/license
*/
import {
  Rule,
  SchematicContext,
  Tree,
  apply,
  branchAndMerge,
  chain,
  filter,
  mergeWith,
  move,
  noop,
  normalizePath,
  template,
  url,
} from '@angular-devkit/schematics';
import 'rxjs/add/operator/merge';
import * as ts from 'typescript';
import * as stringUtils from '../strings';
import { addDeclarationToModule, addExportToModule } from '../utility/ast-utils';
import { InsertChange } from '../utility/change';
import { buildRelativePath, findModuleFromOptions } from '../utility/find-module';
import { Schema as DirectiveOptions } from './schema';


function addDeclarationToNgModule(options: DirectiveOptions): Rule {
  return (host: Tree) => {
    if (options.skipImport || !options.module) {
      return host;
    }

    const modulePath = options.module;
    let sourceText = host.read(modulePath) !.toString('utf-8');
    let source = ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);

    const directivePath = `/${options.sourceDir}/${options.path}/`
                          + (options.flat ? '' : stringUtils.dasherize(options.name) + '/')
                          + stringUtils.dasherize(options.name)
                          + '.directive';
    const relativePath = buildRelativePath(modulePath, directivePath);
    const classifiedName = stringUtils.classify(`${options.name}Directive`);
    const declarationChanges = addDeclarationToModule(source,
                                                      modulePath,
                                                      classifiedName,
                                                      relativePath);
    const declarationRecorder = host.beginUpdate(modulePath);
    for (const change of declarationChanges) {
      if (change instanceof InsertChange) {
        declarationRecorder.insertLeft(change.pos, change.toAdd);
      }
    }
    host.commitUpdate(declarationRecorder);

    if (options.export) {
      sourceText = host.read(modulePath) !.toString('utf-8');
      source = ts.createSourceFile(modulePath, sourceText, ts.ScriptTarget.Latest, true);

      const exportRecorder = host.beginUpdate(modulePath);
      const exportChanges = addExportToModule(source, modulePath,
                                              stringUtils.classify(`${options.name}Directive`),
                                              relativePath);

      for (const change of exportChanges) {
        if (change instanceof InsertChange) {
          exportRecorder.insertLeft(change.pos, change.toAdd);
        }
      }
      host.commitUpdate(exportRecorder);
    }

    return host;
  };
}


function buildSelector(options: DirectiveOptions) {
  let selector = options.name;
  if (options.prefix) {
    selector = `${options.prefix}-${selector}`;
  }

  return stringUtils.camelize(selector);
}

export default function (options: DirectiveOptions): Rule {
  options.selector = options.selector || buildSelector(options);
  options.path = options.path ? normalizePath(options.path) : options.path;

  return (host: Tree, context: SchematicContext) => {
    options.module = findModuleFromOptions(host, options);
    const templateSource = apply(url('./files'), [
      options.spec ? noop() : filter(path => !path.endsWith('.spec.ts')),
      template({
        ...stringUtils,
        'if-flat': (s: string) => options.flat ? '' : s,
        ...options as object,
      }),
      move(options.sourceDir !),
    ]);

    return chain([
      branchAndMerge(chain([
        addDeclarationToNgModule(options),
        mergeWith(templateSource),
      ])),
    ])(host, context);
  };
}
