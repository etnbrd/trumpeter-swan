import * as fs from 'fs'
import * as vega from 'vega'
import * as vl from 'vega-lite'

import {Dependencies, getNodeName} from './ast-utils'

interface Node {
  name: string,
  group: number,
  index: number
}

interface Link {
  source: number,
  target: number,
  value: number
}

interface Data {
  nodes: Node[],
  links: Link[]
}

const getVegaSpec = (data: Data): vega.Spec => ({
  "$schema": "https://vega.github.io/schema/vega/v5.json",
  "description": "A node-link diagram with force-directed layout, depicting character co-occurrence in the novel Les Misérables.",
  "width": 1000,
  "height": 1000,
  "padding": 0,
  "autosize": "none",

  "signals": [
    { "name": "cx", "update": "width / 2" },
    { "name": "cy", "update": "height / 2" },
    { "name": "nodeRadius", "value": 8, "bind": {"input": "range", "min": 1, "max": 50, "step": 1} },
    { "name": "nodeCharge", "value": -30, "bind": {"input": "range", "min":-100, "max": 10, "step": 1} },
    { "name": "linkDistance", "value": 30, "bind": {"input": "range", "min": 5, "max": 100, "step": 1} },
    { "name": "static", "value": true, "bind": {"input": "checkbox"} },
    {
      "description": "State variable for active node fix status.",
      "name": "fix", "value": false,
      "on": [
        {
          "events": "symbol:mouseout[!event.buttons], window:mouseup",
          "update": "false"
        },
        {
          "events": "symbol:mouseover",
          "update": "fix || true"
        },
        {
          "events": "[symbol:mousedown, window:mouseup] > window:mousemove!",
          "update": "xy()",
          "force": true
        }
      ]
    },
    {
      "description": "Graph node most recently interacted with.",
      "name": "node", "value": null,
      "on": [
        {
          "events": "symbol:mouseover",
          "update": "fix === true ? item() : node"
        }
      ]
    },
    {
      "description": "Flag to restart Force simulation upon data changes.",
      "name": "restart", "value": false,
      "on": [
        {"events": {"signal": "fix"}, "update": "fix && fix.length"}
      ]
    }
  ],

  "data": [
    {
      "name": "node-data",
      // "url": "data/miserables.json",
      "format": {"type": "json", "property": "nodes"},
      "values": data
    },
    {
      "name": "link-data",
      // "url": "data/miserables.json",
      "format": {"type": "json", "property": "links"},
      "values": data
    }
  ],

  "scales": [
    {
      "name": "color",
      "type": "ordinal",
      "domain": {"data": "node-data", "field": "group"},
      "range": {"scheme": "viridis"}
    }
  ],

  "marks": [
    {
      "name": "nodes",
      "type": "symbol",
      "zindex": 1,

      "from": {"data": "node-data"},
      "on": [
        {
          "trigger": "fix",
          "modify": "node",
          "values": "fix === true ? {fx: node.x, fy: node.y} : {fx: fix[0], fy: fix[1]}"
        },
        {
          "trigger": "!fix",
          "modify": "node", "values": "{fx: null, fy: null}"
        }
      ],

      "encode": {
        "enter": {
          "fill": {"scale": "color", "field": "group"},
          "stroke": {"value": "black"}
        },
        "update": {
          "size": {"signal": "2 * nodeRadius * nodeRadius"},
          "cursor": {"value": "pointer"}
        }
      },

      "transform": [
        {
          "type": "force",
          "iterations": 300,
          "restart": {"signal": "restart"},
          "static": {"signal": "static"},
          "signal": "force",
          "forces": [
            {"force": "center", "x": {"signal": "cx"}, "y": {"signal": "cy"}},
            {"force": "collide", "radius": {"signal": "nodeRadius"}},
            {"force": "nbody", "strength": {"signal": "nodeCharge"}},
            {"force": "link", "links": "link-data", "distance": {"signal": "linkDistance"}}
          ]
        }
      ]
    },
    {
      "type": "path",
      "from": {"data": "link-data"},
      "interactive": false,
      "encode": {
        "update": {
          "stroke": {"value": "#ccc"},
          "strokeWidth": {"value": 0.5}
        }
      },
      "transform": [
        {
          "type": "linkpath",
          "require": {"signal": "force"},
          "shape": "line",
          "sourceX": "datum.source.x", "sourceY": "datum.source.y",
          "targetX": "datum.target.x", "targetY": "datum.target.y"
        }
      ]
    }
  ]
})

export const renderPng = async (data: Data) => {
  const vegaSpec = getVegaSpec(data)
  const view = new vega.View(vega.parse(vegaSpec), { renderer: 'none' }); // create a Vega view based on the spec
  const canvas = await view.toCanvas() // render to canvas
  
  const file = fs.createWriteStream("output.png");    // use a filename of choice
  const stream = canvas.createPNGStream();            // create a png stream from the canvas
  stream.pipe(file);                                  // write the stream to a file
}


export const renderPlainList = (entries: Map<string, Set<string>>) =>
  Array.from(entries.entries()).sort().map(
    ([key, set]) =>
    `${key}\n${Array.from(set).sort().map(entry => `  - ${entry}`).join('\n')}`
  ).join('\n')

export const renderMarkdownTable = (entries: Map<string, Set<string>>, header: [string, string]) =>
  [
    `| ${header[0]} | ${header[1]} |`,
    `| ------------ | ------------ |`,
    ...Array.from(entries.entries()).map(
      ([key, set]) =>
      `| ${key} | <ul>${Array.from(set).map(entry => `<li>${entry}</li>`).join('')}</ul> |`
    )
  ].join('\n')

export const renderGraphviz = (entries: Map<string, Set<string>>) =>
  [
    'digraph configDependents {',
    '  rankdir=LR;',
    '  node [shape=box]',
    ...Array.from(entries.entries()).sort().flatMap(
      ([key, set]) =>
        Array.from(set.values()).map((target) => `  "${target}" -> "${key}"`)
    ),
    '}'
  ].join('\n')

export const renderAncestors = (ancestors: Dependencies) => {
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

export const renderTopologyMap = (nodes: string[], edges: Array<{source: string, target: string}>) => {
  return {
    nodes: nodes.map(nodeName => (    {
      id: nodeName,
      type: 'square',
      // description: '1 of 116 endpoints',
      icon: 'function',
    })), 
    edges: edges.map(({source, target}) => ({
      source,
      target,
      // description: 'Increased latency on SETEX',
    }))
  }
}