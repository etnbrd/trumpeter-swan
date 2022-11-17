import * as path from 'path'

import {SourceFile, ts, ReferencedSymbol} from 'ts-morph'

interface ImportedSymbol {
  alias?: string;
  name: string;
  references: ReferencedSymbol[];
}

export interface Import {
  imports: Array<{
    imports: Array<string>
    moduleSpecifier: string
  }>
  sourceFilePath: string
}

export const getImports = (sourceFile: SourceFile, rootPath: string) => {
  const sourceFilePath = sourceFile.getFilePath()
  const importDeclarations = sourceFile.getImportDeclarations().map(importDeclaration => {

    const imports: Array<{alias?: string, name: string, references: ReferencedSymbol[]}> = []
    const defaultImport = importDeclaration.getDefaultImport()
    if (defaultImport) {
      imports.push({
        name: defaultImport.getText(),
        references: defaultImport.findReferences()
      })
    }

    const namespaceImport = importDeclaration.getNamespaceImport()
    if (namespaceImport) {
      imports.push({
        name: namespaceImport.getText(),
        references: namespaceImport.findReferences()
      })
    }

    const namedImports = importDeclaration.getNamedImports()
    for (const namedImport of namedImports) {

      const aliasNode = namedImport.getAliasNode()
      const nameNode = namedImport.getNameNode()

      const identifier = 
      imports.push({
        name: nameNode.getText(),
        alias: aliasNode?.getText(),
        references: (aliasNode ?? nameNode).findReferences(),
      })
    }

    const moduleSpecifiedValue = importDeclaration.getModuleSpecifierValue()

    const {dir} = path.parse(sourceFilePath)

    const moduleSpecifier = moduleSpecifiedValue.startsWith('.')
      ? path.resolve(dir, moduleSpecifiedValue).replace(rootPath, '')
      : moduleSpecifiedValue

    return {
      imports,
      moduleSpecifier,
    }
  })

  return {
    sourceFilePath: sourceFilePath.replace(rootPath, ''),
    imports: importDeclarations,
  }
}
