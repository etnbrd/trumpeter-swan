import * as path from 'path'
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
  ParameterDeclaration,
  ReferenceEntry,
  SourceFile,
  ts,
  Type,
  VariableDeclaration,
} from 'ts-morph'

import {Import} from './imports'

export type Dependencies = Map<Node, Dependent[]>

type DependentReference = CallExpression | Identifier | ImportDeclaration
type DependentDeclaration = FunctionDeclaration | SourceFile | VariableDeclaration | ClassDeclaration | ParameterDeclaration

interface Dependent {
  reference: DependentReference
  declaration: DependentDeclaration
}

// ----

export const getExportedDeclarationsFromFilePath = (project: Project, filePath: string, exportedName: string) => {
  // const sourceFiles = project.getSourceFiles(filePath)
  const sourceFile = project.getSourceFiles().find(sourceFile => sourceFile.getFilePath().endsWith(filePath))

  if (!sourceFile) {
    console.log(filePath, project.getSourceFiles().map(file => file.getFilePath()))
    throw 'source file not found'
  }

  return getExportedDeclarations(sourceFile, exportedName)
}

export const getExportedDeclarations = (sourceFile: SourceFile, exportedName: string) => {
  const exportedDeclaration = sourceFile.getExportedDeclarations().get(exportedName)

  if (!exportedDeclaration) {
    console.log(`can't find exported declaration of ${sourceFile.getFilePath()} - ${exportedName}`)
    throw 'no declaration found'
  }

  if (exportedDeclaration.length > 1) {
    throw 'multiple exported declaration'
  }

  return exportedDeclaration[0]
}

// ----

// getDependentDeclarationsRecursively returns a map between a declaration and all its dependents declaration, recursively, starting from the provided node
// From a node, it finds all the dependents calling that node, then recursively call itself again with all of this dependents.
export const getDependentDeclarationsRecursively = (node: Node, project: Project, projectRootPath: string, n = 22, dependencies: Dependencies = new Map()) => {
  const dependents = dependencies.get(node) ?? getDependentDeclarations(node, projectRootPath)
  dependencies.set(node, dependents)

  if (n > 0) {
    for (const dependent of dependents) {
      if (!dependencies.has(dependent.declaration)) {
        getDependentDeclarationsRecursively(dependent.declaration, project, projectRootPath, n - 1, dependencies)
      }
    }
  }

  return dependencies
}

// getDependentDeclarations returns all the declarations that depends on the given node.
// It looks for all the references of the given node, and find their parent declaration.
// e.g. given the identifier of a function, it returns all the functions, files, classes... calling this identifier.
export const getDependentDeclarations = (node: Node, projectRootPath: string) => {
  const dependents: Array<Dependent> = []

  const references = getReferences(node, projectRootPath)

  for (const reference of references) {
    if (
      Node.isCallExpression(reference) ||
      Node.isIdentifier(reference) ||
      Node.isImportDeclaration(reference)
    ) {
      const declaration = getDependentDeclaration(reference)

      if ( // Discard the reference that is ...
        !Node.isImportDeclaration(declaration) && // the import
        !isVariableDeclarationName(reference) && // the variable declaration
        !isFunctionDeclarationName(reference) // the function declaration
      ) {
        dependents.push({declaration, reference})
      }
    } else {
      console.log('MISSING IN PARENTS FROM DECLARATION => ', reference.getKindName())
    }
  }

  return dependents
}

// getReferences returns the nodes that are referencing the provided node
// - for a class or a function, it returns all the identifier node referencing it (e.g. to later call it)
// - for a sourceFile, it returns all the importDeclaration importing it
export const getReferences = (node: Node, projectRootPath: string) => {
  if (
    Node.isClassDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isVariableDeclaration(node) || 
    Node.isParameterDeclaration(node)
  ) {
    return node.findReferencesAsNodes()
  } else if (
    Node.isPropertyAssignment(node)
  ) {
    console.log('SKIPPING PROPERTY ASSIGNEMENT FOR NOW')
    throw 'missing property assignement implementation'
  } else if (
    Node.isSourceFile(node)
  ) {
    const {dir, name} = path.parse(path.relative(projectRootPath, node.getFilePath()))
    const relativeFilePath = path.join(dir, name)

    return node.getReferencingSourceFiles()
      .flatMap(sourceFile => sourceFile.getImportDeclarations())
      .filter(importDeclaration => {
        const importPath = importDeclaration.getModuleSpecifier().getText().replace(/'/g, '')
        return path.join(dir, importPath) === relativeFilePath
      })
  } else {
    console.log('MISSING IN REFERENCE => ', node.getKindName(), node.getText().slice(0, 100))
    throw 'missing reference implementation for node'
  }
}

// getDependentDeclaration will recursue the AST ancestry chain from a node until finding the declaration wrapping this node
// e.g. given a function call, it returns the function declaration calling the given function
export const getDependentDeclaration = (node: Node): DependentDeclaration => {
  const parent = node.getParent()

  if (!parent) {
    console.log(node)
    throw 'orphaned node'
  }

  // If the node is an argument in the call expression, then let's follow that to the parameter declaration, which will
  // eventually bubble up again in this call expression with node being the caller expression
  if (Node.isCallExpression(parent) && parent.getArguments().includes(node)) {
    // TODO this condition body could be refactored into a function
    const caller = parent.getExpression()

    const [declaration, ...rest] = caller.getSymbol().getDeclarations()
    if (rest.length > 0) {
      console.log('DECLARATIONS', [declaration, ...rest])
      throw 'several implementation for caller in call expression'
    }

    if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer()
      if (Node.isFunctionExpression(initializer) || Node.isArrowFunction(initializer)) {
        // For simplicity, we just use the index of the argument to get the index of the parameter.
        // We don't handle spread operator yet, which will be really confusing.
        const parameters = initializer.getParameters()
        const callArguments = parent.getArguments()
        const parameterDeclaration = parameters[callArguments.findIndex(arg => arg == node)]
        return parameterDeclaration
      }
    } else if (
      Node.isFunctionDeclaration(declaration)
    ) {
      throw 'todo, not implemented yet'
    } else {
      console.log(`[${declaration.getText()} - ${declaration.getKindName()}]`)
      console.log(declaration)
      throw 'not a function declaration'
    }
  }

  if (
    Node.isFunctionDeclaration(parent) ||
    Node.isVariableDeclaration(parent) && Node.isArrowFunction(node) || // e.g. const a = () => {}
    Node.isSourceFile(parent) ||
    Node.isClassDeclaration(parent)
  ) {
    return parent
  } else if (
    Node.isImportDeclaration(parent)
  ) {
    return parent.getSourceFile()
  } else if (
    Node.isPropertyAssignment(parent) && Node.isArrowFunction(node)
  ) {
    const parentObject = parent.getParentOrThrow()
    const declaration = parentObject.getParentOrThrow()

    if (Node.isVariableDeclaration(declaration)) {
      return declaration
    } else {
      console.log(`MISSING VARIABLE DECLARATION ${getNodeName(declaration)}, ${getNodeName(parentObject)}, ${getNodeName(parent)}`)
      return getDependentDeclaration(parent)
    }
  } else {
    return getDependentDeclaration(parent)
  }
}

// ----

// getDependencyChains builds the dependency chains from a source to a target by recursively finding the direct dependencies from the source until it reaches the target
export const getDependencyChains = (
  dependencies: Dependencies,
  source: Node,
  target: Node,
  currentChain: Node[] = [source],
  completeChains: Array<Node[]> = []
) => {
  if (source === target) {
    completeChains.push(currentChain)
  }

  const directDependencies = getDirectDependencies(dependencies, source)
  for (const dependency of directDependencies) {
    if (!currentChain.includes(dependency)) { // prevent recursions
      getDependencyChains(dependencies, dependency, target, [...currentChain, dependency], completeChains)
    }
  }

  return completeChains
}

// getDirectDependencies returns the nodes for all the direct dependencies of the provided declaration
export const getDirectDependencies = (dependencies: Dependencies, declaration: Node) => {
  const directDependencies: Set<Node> = new Set()

  // Get all the direct dependencies of the provided declaration (from the provided map of dependencies)
  // It adds all the declarations that the provided declaration depends upon
  for (const [dependency, dependents] of dependencies.entries()) {
    if (dependents.some(dependent => dependent.declaration === declaration)) {
      directDependencies.add(dependency)
    }
  }

  return Array.from(directDependencies.values())
}

// ----

export function getNodeId(node: Node) {
  if (
    Node.isVariableDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isPropertyAssignment(node)
  ) {
    return `${node.getSourceFile().getFilePath()}:${node.getName()}`
  }

  if (
    Node.isIdentifier(node) ||
    Node.isStringLiteral(node) ||
    Node.isParameterDeclaration(node)
  ) {
    return `${node.getSourceFile().getFilePath()}:${node.getText()}`
  }

  if (Node.isSourceFile(node)) {
    return node.getFilePath()
  }

  if (Node.isImportDeclaration(node)) {
    return getNodeName(node.getModuleSpecifier())
  }

  if (Node.isObjectLiteralExpression(node)) {
    return getNodeName(node.getParent())
  }

  console.log('UNKNWON NODE ID', node.getKindName())
  console.log(node)
  throw 'unknown node id'
}

export const getNodeName = (node: Node) => {
  if (
    Node.isVariableDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isPropertyAssignment(node)
  ) {
    return node.getName()
  }

  if (
    Node.isIdentifier(node) ||
    Node.isStringLiteral(node) ||
    Node.isParameterDeclaration(node)
  ) {
    return node.getText()
  }

  if (Node.isSourceFile(node)) {
    return node.getFilePath()
  }

  if (Node.isImportDeclaration(node)) {
    return getNodeName(node.getModuleSpecifier())
  }

  if (Node.isObjectLiteralExpression(node)) {
    return getNodeName(node.getParent())
  }

  if (Node.isCallExpression(node)) {
    return getNodeName(node.getExpression())
  }

  console.log('UNKNWON NODE NAME', node.getKindName())
  console.log(node.getText())
  console.log(node)
  throw 'unknown node name'
}

export const printNode = (node: Node) => {
  const {line, column} = node.getSourceFile().getLineAndColumnAtPos(node.getStart())
  return `[${getNodeName(node)}: ${node.getKindName()}, ${node.getSourceFile().getFilePath()}:${line}:${column}]`
}

const isVariableDeclarationName = (node: Node) => {
  const parent = node.getParent()
  return Node.isVariableDeclaration(parent) && parent.getNameNode() === node
}

const isFunctionDeclarationName = (node: Node) => {
  const parent = node.getParent()
  return Node.isFunctionDeclaration(parent) && parent.getNameNode() === node
}
