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
      const dependencies = getDependentDeclarationsRecursively(targetDeclaration, project, projectRootPath)
      // printDependencies(dependencies, targetDeclaration)

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
