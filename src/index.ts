import * as path from 'path'
import * as fs from 'fs'
import {
  ArrowFunction,
  CallExpression,
  ClassDeclaration,
  ExportedDeclarations,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  ImportDeclaration,
  Node,
  Project,
  PropertyAccessExpression,
  PropertyAssignment,
  ReferenceEntry,
  SourceFile,
  ts,
  Type,
  VariableDeclaration,
} from 'ts-morph'

import {getImports, Import} from './imports'
import {Dependencies, getDependencyChains, getExportedDeclarationsFromFilePath, getNodeName, getDependentDeclarationsRecursively, printNode} from './ast-utils'
import {renderAncestors, renderTopologyMap} from './render'

export interface NodeIdentifier {
  filePath: string;
  exportedName: string;
}

export default async function swan(project: Project, projectRootPath: string, sources: NodeIdentifier[], targets: NodeIdentifier[]) {

  const imports = await getCachedImports(project, projectRootPath)

  // -------------------------------
  // EXECUTION FLOW GRAPH
  // -------------------------------

  const sourceToTargets: Map<string, Set<string>> = new Map()
  const targetToSources: Map<string, Set<string>> = new Map()

  for (const target of targets) {
    for (const source of sources) {
      // Get the declaration object from both the specified target and source
      const targetDeclaration = getExportedDeclarationsFromFilePath(project, target.filePath, target.exportedName)
      const sourceDeclaration = getExportedDeclarationsFromFilePath(project, source.filePath, source.exportedName)

      // Get all the dependents, recursively, from the target declaration.
      // That is, find all the functions (classes, files, ...) that call (import, ...) the given target declaration
      const dependencies = getDependentDeclarationsRecursively(targetDeclaration, project, imports, projectRootPath)
      // printDependencies(dependencies, targetDeclaration)

      // Find all the dependency chains from the source to the target
      const dependencyChains = getDependencyChains(dependencies, sourceDeclaration, targetDeclaration)

      // Turn all the dependency chains into graph relations
      for (const dependencyChain of dependencyChains) {
        let previousNodeName: string

        for (const node of dependencyChain) {
          const nodeName = getNodeName(node)
          // nodes.add(nodeName)
          targetToSources.set(nodeName, targetToSources.get(nodeName) ?? new Set())
          sourceToTargets.set(nodeName, sourceToTargets.get(nodeName) ?? new Set())

          if (previousNodeName) {
            sourceToTargets.get(previousNodeName).add(nodeName)
            targetToSources.get(nodeName).add(previousNodeName)
            // edges.add(`${previousNodeName} -> ${nodeName}`)
          }
          previousNodeName = nodeName
        }
      }
    }
  }

  const edges = Array.from(sourceToTargets.entries()).flatMap(([source, targets]) => Array.from(targets).map(target => ({source, target})))
  const nodes = Array.from(sourceToTargets.keys())

  console.log(edges)
  console.log(nodes)

  process.stdout.write(JSON.stringify(renderTopologyMap(nodes, edges)) + '\n');
}

const getCachedImports = async (project: Project, projectRootPath: string): Promise<Import[]> => {
  const cacheFilePath = './cached-imports.json'

  try {
    const imports = await fs.promises.readFile(cacheFilePath)
    console.log('used cached imports')
    return JSON.parse(imports.toString())
  } catch (error) {
    console.log('generating imports')
    const imports = project.getSourceFiles()
      .filter(sourceFile => sourceFile.getFilePath() && !sourceFile.getFilePath().endsWith('.d.ts'))
      .map(sourceFile => getImports(sourceFile, projectRootPath))

    const serializedImports = serializeImports(imports)
    const sortedImports = serializedImports.sort((a, b) => a.sourceFilePath > b.sourceFilePath ? 1 : -1)
    console.log('caching imports')
    void fs.promises.writeFile(cacheFilePath, JSON.stringify(serializedImports))
    return serializedImports
  }
}

const serializeImports = (imports) => imports.map(({imports, sourceFilePath}) => ({
  imports: imports.map(({imports, moduleSpecifier}) => ({
    moduleSpecifier,
    imports: imports.map(({name}) => name)
  })),
  sourceFilePath
}))

function printDependencies(dependencies: Dependencies, targetDeclaration: Node) {
  console.log('TARGET:')
  console.log(printNode(targetDeclaration))

  console.log('DEPENDENCIES', dependencies.size)
  for (const [dependency, dependents] of dependencies.entries()) {
    console.log('- dependency node')
    console.log(printNode(dependency))
    for (const dependent of dependents) {
      console.log('---')
      console.log('- dependent declaration node')
      console.log(printNode(dependent.declaration))
      console.log('- dependent reference node')
      console.log(printNode(dependent.reference))
    }
    console.log('---\n\n')
  }
}
