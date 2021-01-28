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
  ReferenceEntry,
  SourceFile,
  ts,
  Type,
  VariableDeclaration,
} from 'ts-morph'

import {getImports} from './imports'

export default async function main(project: Project) {

  // project.getSourceFiles().map((sourceFile) => {

  //   const functions: Array<ArrowFunction | FunctionDeclaration | FunctionExpression> = []
  //   const calls: Array<Node<ts.Node>> = []
  //   // const functions = sourceFile.getFunctions() // getFunctions only get Function Declaration
  //   const variables = sourceFile.getVariableDeclarations()

  //   // const functionExpression = sourceFile.getVariableDeclarationOrThrow("add").getInitializerIfKindOrThrow(SyntaxKind.FunctionExpression);


  //   sourceFile.forEachDescendant((node) => {

  //     const kind = node.getKind()

  //     if (kind === ts.SyntaxKind.CallExpression) {
  //       const typedNode = node as CallExpression
  //       calls.push(node)
  //     }

  //     if (kind === ts.SyntaxKind.ArrowFunction) {
  //       const typedNode = node as ArrowFunction
  //       functions.push(typedNode)
  //     }

  //     if (kind === ts.SyntaxKind.FunctionDeclaration) {
  //       const typedNode = node as FunctionDeclaration
  //       console.log('FunctionDeclaration', typedNode.getName())
  //       const references = typedNode.findReferences()

  //       for (const ref of references) {
  //         console.log(ref)
  //       }
  //       functions.push(typedNode)
  //     }

  //     if (kind === ts.SyntaxKind.FunctionExpression) {
  //       const typedNode = node as FunctionExpression
  //       console.log('FunctionExpression', typedNode.getName())
  //       functions.push(typedNode)
  //     }

  //     // console.log('-> ', node.getKindName(), node.getText())

  //   })


  //   // for (const variable of variables) {
  //   //   const init = variable.getInitializer()
  //   //   if (init.getKind() === ts.SyntaxKind.FunctionExpression) {
  //   //     console.log('fn expression', variable.getText())
  //   //   }

  //   //   if (init.getKind() === ts.SyntaxKind.ArrowFunction) {
  //   //     console.log('arrow function', variable.getText())
  //   //   }

  //   //   // console.log('variable', init.getKindName(), variable.getText())
  //   // }

  //   for (const fn of functions) {
  //     console.log('fn declaration', fn.getText())
  //   }

  //   for (const call of calls) {
  //     console.log('call', call.getText())
  //   }
  // })

  const imports = project.getSourceFiles()
    .filter(sourceFile => sourceFile.getFilePath().endsWith('worker/src/dns.ts'))
    .map(getImports)
    .filter(importDeclaration => !importDeclaration.sourceFilePath.startsWith('/worker/test'))

  console.log(imports)

  const configDependent = imports.filter(importDeclaration => 
    importDeclaration.imports.some(childImport => childImport.moduleSpecifier.startsWith('/worker/src/config') && childImport.imports.some(importedIdentifier => importedIdentifier.name === 'config'))
  )

  const files = {}
  const configField = {}
  const points = []

  for (const module of configDependent) {
    const configImport = module.imports.find(childImport => childImport.moduleSpecifier.startsWith('/worker/src/config'))

    for (const importedSymbol of configImport.imports) {
      // console.log(importedSymbol.references.length)

      for (const referenceSymbols of importedSymbol.references) {
        for (const reference of referenceSymbols.getReferences()) {

          if (reference.getSourceFile().getFilePath().startsWith('/Users/etienne.brodu/dd/synthetics-worker/worker/src/')) {
            const parent = reference.getNode().getParentOrThrow()
            if (Node.isPropertyAccessExpression(parent)) {
              const ref = {
                filePath: reference.getSourceFile().getFilePath(),
                start: reference.getTextSpan().getStart(),
                length: reference.getTextSpan().getLength(),
                parentKind: reference.getNode().getParentOrThrow().getKindName(),
                text: parent.getName(),
              }
              files[ref.filePath] = files[ref.filePath] ?? new Set()
              files[ref.filePath].add(ref.text)

              configField[ref.text] = configField[ref.text] ?? new Set()
              configField[ref.text].add(ref.filePath)
              points.push()
            }
          }
        }
      }
    }
  }

  console.log(configField)
  console.log(files)



  // console.log(configDependent.map(importDeclaration => importDeclaration.sourceFilePath))

  // const nodes = imports.sort((importA, importB) => 
  //     importA.sourceFilePath === importB.sourceFilePath
  //     ? 0
  //     : importA.sourceFilePath > importB.sourceFilePath
  //       ? 1 : -1
  //   )
  //   .map((importDeclaration, index) => {
  //     const {sourceFilePath} = importDeclaration

  //     return {
  //       name: sourceFilePath,
  //       group: sourceFilePath.startsWith('/worker/src/config') // is config
  //         ? 0
  //         : importDeclaration.imports.some(childImport => childImport.moduleSpecifier.startsWith('/worker/src/config')) // imports config
  //           ? 1 : 2,
  //       index: index,
  //     }
  //   })

  // // console.log(nodes)

  // const externalImports = new Set()

  // const links = imports.flatMap(importDeclaration => {
  //   const target = nodes.findIndex(node => importDeclaration.sourceFilePath === node.name)

  //   return importDeclaration.imports.flatMap(declaration => {

  //     const source = nodes.findIndex(node => 
  //       declaration.moduleSpecifier + '.ts' === node.name || declaration.moduleSpecifier + '/index.ts' === node.name
  //     )

  //     if (source === -1) {
  //       externalImports.add(declaration.moduleSpecifier)
  //       return []
  //     } else {
  //       return [{
  //         source,
  //         target,
  //         value: 1,
  //       }]
  //     }
  //   })
  // })

  // return {nodes, links}

  // console.log(links)

  // console.log(externalImports)

  // for (const importDeclaration of imports) {
  //   console.log(importDeclaration.sourceFilePath)
  //   console.log(importDeclaration.imports)
  //   console.log('---')
  // }
}


export type AncestryCache = Map<Node, ParentDeclaration[]>

interface ParentDeclaration {
  referenceNode: CallExpression | Identifier,
  parentNode: ClassDeclaration | FunctionDeclaration | VariableDeclaration | SourceFile | PropertyAssignment
}

export const getParentsRecursivelyUntil = (node: Node, n = 22, cache: AncestryCache = new Map()) => {

  // console.log(`-> ${getNodeName(node)}`)

  const parents = cache.get(node) ?? getParentsFromDeclaration(node)
  cache.set(node, parents)

  if (n > 0) {
    for (const parent of parents) {
      if (!cache.has(parent.parentNode)) {
        getParentsRecursivelyUntil(parent.parentNode, n - 1, cache)
      }
    }
  }

  return cache
}

// Get all the parent of every reference from a declaration
export const getParentsFromDeclaration = (declaration: Node) => {
  const declarationFilePath = declaration.getSourceFile().getFilePath()
  const parents: Array<ParentDeclaration> = []

  const references = getReferences(declaration)
  for (const reference of references) {
    const referenceFilePath = reference.getSourceFile().getFilePath()

    // Discard all references that comes from the tests
    if (!referenceFilePath.endsWith('.test.ts') && !referenceFilePath.includes('/worker/test/')) {
      const referenceNode = reference.getNode()

      // Keep only common usage of the reference
      if (
        Node.isCallExpression(referenceNode) ||
        Node.isIdentifier(referenceNode)
      ) {
        const parentNode = getParent(referenceNode)

        // Discard the reference that is just the import
        if (!Node.isImportDeclaration(parentNode)) {
          parents.push({parentNode, referenceNode})
        }
      } else {
        console.log('MISSING IN PARENTS FROM DECLARATION => ', referenceNode.getKindName())
      }
    }
  }

  return parents
}

export const getExportedDeclarations = (sourceFile: SourceFile, exportedName: string) => {
  const exportedDeclaration = sourceFile.getExportedDeclarations().get(exportedName)

  if (!exportedDeclaration) {
    console.log(`can't find exported declaration of ${sourceFile.getFilePath()} - ${exportedName}`)
    throw 'no multiple declaration'
  }

  if (exportedDeclaration.length > 1) {
    throw 'multiple exported declaration'
  }

  return exportedDeclaration[0]
}

// export const getExportedDeclarations = (project: Project, filePath: string, exportedName: string) => {
//   const sourceFile = project.getSourceFiles().find(sourceFile => sourceFile.getFilePath().endsWith(filePath))
//   // const exportSymbol = sourceFile.getExportSymbols().find(exportSymbol => exportSymbol.getName() === exportedName)
//   const exportedDeclaration = sourceFile.getExportedDeclarations().get(exportedName)

//   if (exportedDeclaration.length > 1) {
//     throw 'multiple exported declaration'
//   }

//   return exportedDeclaration[0]
// }

export const getReferences = (node: Node) => {
  const references: ReferenceEntry[] = []
  if (
    Node.isClassDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isVariableDeclaration(node)
  ) {
    for (const referencedSymbol of node.findReferences()) {
      references.push(...referencedSymbol.getReferences())
    }
  } else if (
    Node.isPropertyAssignment(node)
  ) {
    console.log('SKIPPING PROPERTY ASSIGNEMENT FOR NOW')
  } else if (
    Node.isSourceFile(node)
  ) {
    // console.log('SKIPPING SOURCE FILE FOR NOW', node.getFilePath())
  } else {
    console.log('MISSING IN REFERENCE => ', node.getKindName(), node.getText().slice(0, 100))
  }

  return references
}



export const getParent = (node: Node): FunctionDeclaration | SourceFile | VariableDeclaration | ImportDeclaration | ClassDeclaration => {
  const parent = node.getParentOrThrow()

  // console.log('looking for parent of ', node.getText())

  if (
    Node.isFunctionDeclaration(parent) ||
    Node.isVariableDeclaration(parent) && Node.isArrowFunction(node) ||
    Node.isSourceFile(parent) ||
    Node.isImportDeclaration(parent) ||
    Node.isClassDeclaration(parent)
  ) {
    return parent
  } else if (
    Node.isPropertyAssignment(parent) && Node.isArrowFunction(node)
  ) {
    const parentObject = parent.getParentOrThrow()
    const declaration = parentObject.getParentOrThrow()

    if (Node.isVariableDeclaration(declaration)) {
      return declaration
    } else {
      console.log(`MISSING VARIABLE DECLARATION ${getNodeName(declaration)}, ${getNodeName(parentObject)}, ${getNodeName(parent)}`)
      return getParent(parent)
    }
  } else {
    // console.log('-> ', parent.getKindName())
    return getParent(parent)
  }
}
