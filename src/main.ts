import {exec} from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as util from 'util'
import yargs from 'yargs'
import {hideBin} from 'yargs/helpers'
import {
  VariableDeclaration,
  SourceFile,
  FunctionDeclaration,
  ClassDeclaration,
  ImportDeclaration,
  PropertyAssignment,
  Node,
  Project,
  ts,
  Type
} from 'ts-morph'

import swan from '../src'
import {NodeIdentifier} from '../src'

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('projectRoot', {
      alias: 'r',
      type: 'string',
      demandOption: true,
      description: 'The project root to parse',
    })
    .option('tsConfigFilePath', {
      alias: 'c',
      type: 'string',
      demandOption: true,
      description: 'The ts config file path from the project'
    })
    .option('sources', {
      alias: 's',
      type: 'array',
      demandOption: true,
      description: 'The source AST nodes from which to generate the execution graph. Must be a relative path and an exported identifier, separated by a colon. e.g. index.ts:main'
    })
    .option('targets', {
      alias: 't',
      type: 'array',
      demandOption: true,
      description: 'The target AST nodes until which to generate the execution graph. Must be a relative path and an exported identifier, separated by a colon. e.g. server.ts:serve'
    })
    .parse()

  const project = new Project({
    tsConfigFilePath: path.join(argv.tsConfigFilePath),
  });

  const sources = argv.sources.map(splitNodeIdentifier)
  const targets = argv.targets.map(splitNodeIdentifier)

  await swan(project, argv.projectRoot, sources, targets)
}

function splitNodeIdentifier(identifier): NodeIdentifier {
  const [filePath, exportedName] = identifier.split(':')
  return {filePath, exportedName}
}

main()
