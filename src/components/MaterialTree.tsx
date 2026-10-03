import type { MaterialNode } from '../types'

function Branch({ node, depth = 0 }: { node: MaterialNode; depth?: number }) {
  return (
    <div className="material-branch" style={{ marginLeft: depth * 18 }}>
      <div className="material-row">
        <span className={node.isRaw ? 'pill success' : 'pill'}>{node.isRaw ? 'RAW' : node.skillKey?.toUpperCase() ?? 'STEP'}</span>
        <strong>{node.quantity.toLocaleString()} × {node.label}</strong>
      </div>
      {node.children.map((child, index) => <Branch key={child.itemKey + '-' + index} node={child} depth={depth + 1} />)}
    </div>
  )
}

export default function MaterialTree({ root }: { root: MaterialNode }) {
  return <div className="material-tree"><Branch node={root} /></div>
}
