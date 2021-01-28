import {exec} from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as util from 'util'

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

import swan, {AncestryCache, getReferences, getParent, getNodeName, getExportedDeclarations, getParentsFromDeclaration, getParentsRecursivelyUntil} from '../src'
import {render} from '../src/render'

const execPromise = util.promisify(exec)

const projectRootPath = '/Users/etienne.brodu/dd/synthetics-worker'
const project = new Project({
  tsConfigFilePath: path.join(projectRootPath, 'worker/tsconfig.json'),
  // TODO exclude tests
});

const main = async () => {
  const constantsCandidates = [
    // 'accessKey',
    // 'allowedDomainNames',
    // 'allowedIPRanges',
    'apiRequestMaxTimeout', // hidden
    'asbLongPollingTimeout', // hidden
    // 'blacklistedRange',
    // 'blockedDomainNames',
    // 'blockedIPRanges',
    // 'checksQueueURL',
    // 'concurrency',
    // 'datadogApiKey',
    // 'datadogHostOverride',
    // 'deadQueueURL',
    // 'dnsServer',
    // 'dnsServerRoundRobin',
    // 'dnsUseHost',
    // 'enableDefaultBlockedIpRanges',
    'enableExtractValues', // hidden
    // 'enableFileLogging',
    // 'enableIPv6',
    // 'enableProfiling',
    // 'enableStatusProbes',
    // 'enableTracer',
    // 'encryptExtractedValues',
    // 'expectedRuntimes',
    // 'expectedTiers',
    // 'gracefulExitTimeout',
    // 'healthChecks',
    // 'healthChecksThreshold',
    // 'healthChecksTicker',
    // 'localTestCache',
    // 'localTestCacheMaxCount',
    // 'logFileMaxDays',
    // 'logFormat',
    'longPollingBuffer', // hidden
    // 'managedPortRangeEnd',
    // 'managedPortRangeStart',
    'maxAPIBodySizeIfProcessed', // hidden
    'maxAPIDownloadBodySize', // hidden
    'maxExtractedValueSize', // hidden
    'maxExtractedValuesNb', // hidden
    'maxNbRedirects', // hidden
    // 'maxNumberMessagesToFetch',
    'messageVisibility', // hidden
    'minPollingInterval', // hidden
    'minStatsdReconnectInterval', // hidden
    // 'privateKey',
    // 'proxy',
    // 'proxyDatadog',
    // 'proxyIgnoreSSLErrors',
    // 'proxyTestRequests',
    // 'publicKey',
    // 'publicKeysByMainDC',
    'regexTimeout', // hidden
    // 'reportMetrics',
    'requestProcessingTime', // hidden
    // 'restartInterval',
    // 'restartIntervalSpread',
    'resultAttributesToEncrypt', // hidden
    // 'secretAccessKey',
    // 'shouldRestart',
    // 'site',
    'sqsConnectTimeout', // hidden
    'sqsLongPollingTimeout', // hidden
    // 'sqsRegion',
    'sqsTimeout', // hidden
    // 'statusProbesPort',
    // 'tunnelServiceName',
    // 'tunnelServicePort',
    // 'whitelistedRange',
    'windowsGeckodriverLogEnabled', // hidden
    'windowsGeckodriverLogLevel', // hidden
    'windowsGeckodriverLogPath', // hidden
    // 'workerFlavor',
  ]

  const files = new Map<string, Set<string>>()
  const fields = new Map<string, Set<string>>()
  const constantReferenceFiles = new Set()
  const configReferenceFiles = new Set()

  const classDeclarations = new Map<string, Set<string>>()

  type ParentCallSite = VariableDeclaration | SourceFile | FunctionDeclaration | ((ClassDeclaration | ImportDeclaration) & PropertyAssignment)
  const parentCallsites = new Set<ParentCallSite>()

  const parents = new Map<string, Set<string>>()

  const sourceFile = project.getSourceFiles().find(sourceFile => sourceFile.getFilePath().endsWith('worker/src/config/config.ts'))
  const declaration = getExportedDeclarations(sourceFile, 'config')
  const references = getReferences(declaration)

  for (const reference of references) {
    const filePath = reference.getSourceFile().getFilePath().replace('/Users/etienne.brodu/dd/synthetics-worker/', '')
    if (filePath.endsWith('.test.ts')) {
      continue // discard references from tests
    }
    const parent = reference.getNode().getParentOrThrow()
    if ( // discard ...
      Node.isImportSpecifier(parent) || //... import references
      Node.isExportSpecifier(parent) || //... export references
      Node.isVariableDeclaration(parent) || //... variable definition
      Node.isCallExpression(parent) //... some random reference in dumpConfig
    ) {
      continue 
    }

    // Keep only property access expression
    if (!Node.isPropertyAccessExpression(parent)) {
      throw parent.getKindName()
    }

    // Discard config fields that will be turned into constants
    const configFieldName = parent.getName()
    if (constantsCandidates.includes(configFieldName)) {
      continue
    }

    // discard exceptions because ...
    if (
      filePath === 'worker/src/cli/start-worker.ts' || // cli entrypoint should have immediate access to built config
      filePath === 'worker/src/cli/statsd-connect.ts' || // cli entrypoint should have immediate access to built config

      filePath === 'worker/src/synthetics-browser/driver/selenium/launcher.ts' || // TODO can be turn into static constant
      filePath === 'worker/src/synthetics-http/transform-body.ts' || // TODO can be turn into static constant

      filePath === 'worker/src/synthetics-browser/entrypoint.ts' || // TODO config can be propagated from parent
      filePath === 'worker/src/synthetics-browser/run-test.ts' || // TODO config can be propagated from parent
      filePath === 'worker/src/synthetics-dns/dns-request.ts' || // TODO config can be propagated from parent
      filePath === 'worker/src/synthetics-http/http-request.ts' || // TODO config can be propagated from parent
      filePath === 'worker/src/synthetics-icmp/icmp-request.ts' || // TODO config can be propagated from parent
      filePath === 'worker/src/synthetics-ssl/ssl-request.ts' || // TODO config can be propagated from parent
      filePath === 'worker/src/synthetics-tcp/tcp-request.ts' || // TODO config can be propagated from parent
      filePath === 'worker/src/synthetics-tests/do-test.ts' || // TODO config can be propagated from parent
      filePath === 'worker/src/synthetics-udp/udp-request.ts' || // TODO config can be propagated from parent
      filePath === 'worker/src/synthetics-websocket/websocket-request.ts' || // TODO config can be propagated from parent

      // filePath === 'worker/src/config/config.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/config/index.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/consul/feature.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/dns.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/dogstatsd.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/lib/datadog-intake.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/logger.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/signature/signature-datadog.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/synthetics-tests/clean-result.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/synthetics-tests/extract-values.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/synthetics-tests/regex.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/synthetics-tests/test-encryption.ts' || // TODO static functions using config should be refactored
      // filePath === 'worker/src/tracer.ts' || // TODO static functions using config should be refactored
      false
    )
    {
      continue
    }

    const parentCallSite = getParent(parent)

    // if (Node.isClassDeclaration(parentCallSite)) {
    //   console.log('=> ', getNodeName(parentCallSite))
    //   const refText = getNodeName(parent)
    //   const parentRefText = getNodeName(parentCallSite)

    //   const classDeclaration = classDeclarations.get(refText) ?? new Set()
    //   classDeclarations.set(refText, classDeclaration)
    //   classDeclaration.add(parentRefText)

    //   const file = files.get(filePath) ?? new Set()
    //   files.set(filePath, file)
    //   file.add(`${parentRefText} - ${parent.getText()}`)

    // }

    if (
      Node.isFunctionDeclaration(parentCallSite) ||
      Node.isVariableDeclaration(parentCallSite) ||
      Node.isSourceFile(parentCallSite) ||
      Node.isPropertyAssignment(parentCallSite)
    ) {
      const parentRefText = getNodeName(parentCallSite)

      const parentSet = parents.get(parentRefText) ?? new Set()
      parents.set(parent.getName(), parentSet)
      parentSet.add(parentRefText)

      const file = files.get(filePath) ?? new Set()
      files.set(filePath, file)
      file.add(`${parentRefText} - ${parent.getText()}`)

      parentCallsites.add(parentCallSite)
    }

    // const refText = parent.getName()

    // const file = files.get(filePath) ?? new Set()
    // files.set(filePath, file)
    // file.add(refText)

    // const referenceFiles = constantsCandidates.includes(refText) ? constantReferenceFiles : configReferenceFiles
    // referenceFiles.add(filePath)

    // const field = fields.get(refText) ?? new Set()
    // fields.set(refText, field)
    // field.add(filePath)
  }


  for (const parentCallSite of parentCallsites) {
    const parentRefText = getNodeName(parentCallSite)
    const ancestors = getParentsRecursivelyUntil(parentCallSite)

    // for (const [ancestor, ancestorParents] of ancestors) {
    //   const ancestorRefText = getNodeName(ancestor)

    //   for (const ancestorParent of ancestorParents) {
    //     const {parentNode, referenceNode} = ancestorParent

    //     const greatParentNode = referenceNode.getParent()

    //     console.log(getNodeName(parentNode), greatParentNode?.getKindName())
    //     // if (Node.isImport parentNode) {
    //     //   continue
    //     // }
    //   }
    // }

    console.log(`RENDERING ${parentRefText}`)
    await fs.promises.writeFile(`${parentRefText}-dependencies.dot`, renderGraphviz(renderAncestors(ancestors)))
    await execPromise(`dot -T png ${parentRefText}-dependencies.dot > ${parentRefText}-dependencies.png`)
  }

  console.log('CLASS DECLARATIONS')
  console.log(renderPlainList(classDeclarations))

  console.log('PARENTS')
  console.log(renderPlainList(parents))

  console.log('FILES')
  console.log(renderPlainList(files))
  // console.log(renderPlainList(fields))

  // const onlyConstantFiles = new Map()

  // for (const filePath of exclusion(constantReferenceFiles, configReferenceFiles)) {
  //   for (const field of files.get(filePath)) {
  //     const file = onlyConstantFiles.get(filePath) ?? new Set()
  //     onlyConstantFiles.set(filePath, file)
  //     file.add(field)
  //   }
  // }

  // console.log(renderPlainList(onlyConstantFiles))

  // console.log(onlyConstantFiles)

  // Array.from(onlyConstantFiles).reduce((set: Set<string>, file: string) => Array.from(files.get(file)).forEach((field: string) => set.add(field)), new Set())

}

const exclusion = <T>(set1: Set<T>, set2: Set<T>) => {
  const result = new Set<T>()
  for (const entry of set1) {
    if (!set2.has(entry)) {
      result.add(entry)
    }
  }
  return result
}

main()

  // const configDependents = [
  //   ['worker/src/config/config.ts', 'config'],
  // ]

  // // Get all parents from the declaration
  // for (const [filePath, exportedName] of configDependents) {
  //   const sourceFile = project.getSourceFiles().find(sourceFile => sourceFile.getFilePath().endsWith(filePath))
  //   const declaration = getExportedDeclarations(sourceFile, exportedName)
  //   const parents = getParentsFromDeclaration(declaration)

  //   console.log(`${parents.length} found references of ${getNodeName(declaration)}`)
  //   for (const {referenceNode, parentNode} of parents) {
  //     console.log(`  -> referenced by \`${getNodeName(parentNode).replace('/Users/etienne.brodu/dd/synthetics-worker/', '')}\` from \`${parentNode.getSourceFile().getFilePath().replace('/Users/etienne.brodu/dd/synthetics-worker/', '')}\``)
  //   }
  // }

//   const endFiles = {}

//   const links = new Set()

//   for (const [filePath, exportedName] of configDependents) {
//     const sourceFile = project.getSourceFiles().find(sourceFile => sourceFile.getFilePath().endsWith(filePath))
//     const declaration = getExportedDeclarations(sourceFile, exportedName)

//     const parents = getParentsRecursivelyUntil(declaration)

//     for (const [node, references] of parents) {
//       for (const reference of references) {
//         links.add(`  "${getNodeName(reference.parentNode).replace('/Users/etienne.brodu/dd/synthetics-worker/', '')}" -> "${getNodeName(node)}"`)
//       }
//     }

//     await fs.promises.writeFile('config-dependents.dot',
// `digraph configDependents {
//   rankdir=LR;
//   node [shape=box]
// ${Array.from(links.values()).join(`\n`)}
// }
// `)

    // console.log(parents)

    // for (const {parentNode, referenceNode} of parents) {
    //   if (!Node.isImportDeclaration(parentNode)) {
    //     const filePath = referenceNode.getSourceFile().getFilePath().replace('/Users/etienne.brodu/dd/synthetics-worker/', '')
    //     // const parentNodeName = getNodeName(parentNode)
    //     files[filePath] = files[filePath] || []
    //     files[filePath].push({parentNode, referenceNode})

    //     // if (filePath === 'worker/src/logger.ts' && parentNodeName === 'enableLoggerPrettyPrinting') {
    //     //   const parentRefs = await getReferences(project, filePath, parentNodeName)
    //     //   console.log('=> ', parentRefs)
    //     // }
    //   }
    // }

    // const refs = await getReferences(project, filePath, exportedName)
    // const files = {}
    // for (const ref of refs) {
    //   if (!ref.filePath.endsWith(filePath) && !ref.filePath.endsWith('.test.ts')) {
    //     const node = ref.reference.getNode()
    //     if (
    //       Node.isCallExpression(node) ||
    //       Node.isIdentifier(node)
    //     ) {
    //       const parentNode = await getParent(ref.reference.getNode())
    //       if (!Node.isImportDeclaration(parentNode)) {
    //         const filePath = ref.filePath.replace('/Users/etienne.brodu/dd/synthetics-worker/', '')
    //         const parentNodeName = getNodeName(parentNode)
    //         files[filePath] = files[filePath] || []
    //         files[filePath].push(`line ${node.getStartLineNumber()}: ${parentNodeName} (${parentNode.getKindName()})`)

    //         if (filePath === 'worker/src/logger.ts' && parentNodeName === 'enableLoggerPrettyPrinting') {
    //           const parentRefs = await getReferences(project, filePath, parentNodeName)
    //           console.log('=> ', parentRefs)
    //         }
    //       }
    //     } else {
    //       console.log('MISSING', node.getKindName())
    //     }
    //   }
    // }

//     console.log(`
// ${filePath} - ${exportedName}
// `)
//     console.log(
//       Object.entries(files).map(([file, references]) => {
//         return `
// - ${file}
// ${references.map(({parentNode, referenceNode}) => `  - line ${referenceNode.getStartLineNumber()}: ${getNodeName(parentNode)} (${parentNode.getKindName()})`).join('\n')}
// `
//       })
//     )

  // }


// console.log(project)

// it('should detects all asynchronous functions calls', async () => {
  // const project = new Project()
  // project.addSourceFilesAtPaths(['subjects/server.ts'])

  // const data = await swan(project)
  // await fs.promises.writeFile('data.json', JSON.stringify(data))
  // render(data)
// })
