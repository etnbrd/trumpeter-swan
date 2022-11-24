import * as fs from 'fs'
import * as vega from 'vega'
import * as vl from 'vega-lite'

import {Node} from 'ts-morph'

import {Dependencies, getNodeId, getNodeName} from './ast-utils'

const renderPlainList = (entries: Map<string, Set<string>>) =>
  Array.from(entries.entries()).sort().map(
    ([key, set]) =>
    `${key}\n${Array.from(set).sort().map(entry => `  - ${entry}`).join('\n')}`
  ).join('\n')

const renderMarkdownTable = (entries: Map<string, Set<string>>, header: [string, string]) =>
  [
    `| ${header[0]} | ${header[1]} |`,
    `| ------------ | ------------ |`,
    ...Array.from(entries.entries()).map(
      ([key, set]) =>
      `| ${key} | <ul>${Array.from(set).map(entry => `<li>${entry}</li>`).join('')}</ul> |`
    )
  ].join('\n')

const renderGraphviz = (nodes: Node[], edges: Array<{source: Node, target: Node}>, projectRootPath: string) => {
  // TODO use regex to avoid too many loops
  const escapedNodeId = (node) => getNodeId(node)
    .replaceAll('/','_')
    .replaceAll('.','_')
    .replaceAll('-','_')
    .replaceAll('@','_')
    .replaceAll(':','_')
    .replaceAll(' ','_')
    .replaceAll('(','_')
    .replaceAll(')','_')
    .replaceAll('=','_')
    .replaceAll('>','_')

  const escapedNodeName = (node) => getNodeName(node).replaceAll('>', '')

  const clusters: {[key: string]: Node[]} = {}
  for (const node of nodes) {
    const filePath = node.getSourceFile().getFilePath().replace(projectRootPath, '')
      .replaceAll('/','_')
      .replaceAll('.','_')
      .replaceAll('-','_')
      .replaceAll('@','_')
      .replaceAll(':','_')
      .replaceAll(' ','_')
      .replaceAll('(','_')
      .replaceAll(')','_')
      .replaceAll('=','_')
      .replaceAll('>','_')

    clusters[filePath] ??= []
    clusters[filePath].push(node)
  }

  return [
    'digraph configDependents {',
    '  rankdir=LR;',
    '  node [shape=box]',
    ...Object.entries(clusters).map(([cluster, nodes]) => [
      `  subgraph cluster_${cluster} {`,
      `    label=${cluster}`,
       ...nodes.map(node => `    ${escapedNodeId(node)} [label="${escapedNodeName(node)}"]`),
       `  }`
    ].join('\n')),
    ...edges.map(({source, target}) => `  ${escapedNodeId(source)} -> ${escapedNodeId(target)}`),
    '}'
  ].join('\n')
}

const renderAncestors = (ancestors: Dependencies) => {
  const flat = new Map<string, Set<string>>()

  for (const [ancestor, ancestorParents] of ancestors) {
    const ancestorRefText = getNodeName(ancestor)

    for (const ancestorParent of ancestorParents) {
      const {declaration} = ancestorParent

      const ancestorParentRefText = getNodeName(declaration)

      const hierarchy = flat.get(ancestorRefText) ?? new Set()
      flat.set(ancestorRefText, hierarchy)
      hierarchy.add(ancestorParentRefText)
    }
  }

  return flat
}

const renderTopologyMap = (nodes: Node[], edges: Array<{source: Node, target: Node}>, projectRootPath: string) => {
  return JSON.stringify({
    layoutType: "railway",
    layoutMargin: {
      top: 3,
      right: 2,
      bottom: 2,
      left: 2
    },
    nodeType: "square",
    nodeScale: "custom",
    nodeCustomScale: 0.5,
    nodeMaxWidth: 200,
    nodeMaxHeight: 100,
    nodeBorderScale: 0.125,
    nodeStackOffset: 0.25,
    nodeStackAngle: 315,
    nodeHoverMode: "normal",
    nodeGraphValueScale: 0,
    nodeNameTruncate: "middle",
    nodeLabelWidth: 6,
    nodeLabelAngle: 90,
    edgeType: "railway",
    edgeCustomScale: 0.8,
    edgeHoverMode: "path",
    arrowColor: "edge",
    magnitudeMetric: "throughput",
    enableEdgeMetric: true,
    enableNodeButton: true,
    enableEdgeButton: true,
    disableContextMenu: true,
    disableAnimation: true,
    disableEdgeGap: true,
    nodes: nodes.map(node => ({
      id: getNodeId(node),
      name: getNodeName(node),
      type: 'square',
      icon: 'function',
      description: node.getSourceFile().getFilePath().replace(projectRootPath, ''),
    })), 
    edges: edges.map(({source, target}) => ({
      source: getNodeId(source),
      target: getNodeId(target),
      // description: 'Increased latency on SETEX',
    }))
  })
}

export const renderers: {[key: string]: (nodes: Node[], edges: Array<{source: Node, target: Node}>, projectRootPath: string) => string} = {
  'topologyMap': renderTopologyMap,
  'graphviz': renderGraphviz,
  // 'plainList': renderPlainList,
  // 'markdownTable': renderMarkdownTable,
}