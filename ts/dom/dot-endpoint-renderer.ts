import {registerEndpointRenderer} from "./browser-renderer"
import { _attr, _node } from './svg-util'
import {JsPlumbInstance} from '../core/core'
import { PaintStyle } from '../core/styles'

registerEndpointRenderer("Dot", {
    // TODO `instance` not needed here
    makeNode : (instance:JsPlumbInstance, ep:any, style:PaintStyle) => {
        return _node("circle", {
            "cx": ep.w / 2,
            "cy": ep.h / 2,
            "r": ep.radius
        })
    },

    updateNode : (ep:any, node:SVGElement) => {
        _attr(node, {
            "cx": "" + (ep.w / 2),
            "cy": "" + (ep.h / 2),
            "r": "" + ep.radius
        })
    }
})