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

export interface NodeIdentifier {
  filePath: string;
  exportedName: string;
}

export default async function swan(
  project: Project,
  projectRootPath: string,
  sources: NodeIdentifier[],
  targets: NodeIdentifier[]
): Promise<{edges: {source: Node, target: Node}[], nodes: Node[]}> {

  // TODO it's probably possible to use getReferencingSourceFiles from ts-morph: https://ts-morph.com/details/source-files#getting-referencing-files
  const imports = await getCachedImports(project, projectRootPath)

  // -------------------------------
  // EXECUTION FLOW GRAPH
  // -------------------------------

  const sourceToTargets: Map<Node, Set<Node>> = new Map()
  const targetToSources: Map<Node, Set<Node>> = new Map()

  for (const target of targets) {
    for (const source of sources) {
      // Get the declaration object from both the specified target and source
      const targetDeclaration = getExportedDeclarationsFromFilePath(project, target.filePath, target.exportedName)
      const sourceDeclaration = getExportedDeclarationsFromFilePath(project, source.filePath, source.exportedName)

      // Get all the dependents, recursively, from the target declaration.
      // That is, find all the functions (classes, files, ...) that call (import, ...) the given target declaration
      const dependencies = getDependentDeclarationsRecursively(targetDeclaration, project, imports, projectRootPath)
      // printDependencies(dependencies, targetDeclaration)

      // console.log(dependencies)

      // Find all the dependency chains from the source to the target
      const dependencyChains = getDependencyChains(dependencies, sourceDeclaration, targetDeclaration)

      // Turn all the dependency chains into graph relations
      for (const dependencyChain of dependencyChains) {
        let previousNode: Node

        for (const node of dependencyChain) {
          // console.log(node)
          // const nodeName = getNodeName(node)
          // nodes.add(nodeName)
          targetToSources.set(node, targetToSources.get(node) ?? new Set())
          sourceToTargets.set(node, sourceToTargets.get(node) ?? new Set())

          if (previousNode) {
            sourceToTargets.get(previousNode).add(node)
            targetToSources.get(node).add(previousNode)
          }
          previousNode = node
        }
      }
    }
  }

  const edges = Array.from(sourceToTargets.entries()).flatMap(([source, targets]) => Array.from(targets).map(target => ({source, target})))
  const nodes = Array.from(sourceToTargets.keys())

  return {edges, nodes}
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
