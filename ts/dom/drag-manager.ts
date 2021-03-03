import {BrowserJsPlumbInstance} from "./browser-jsplumb-instance"

import {PARENT_GROUP_KEY, extend, wrap, Dictionary, forEach, PointXY, getWithFunction} from '@jsplumb/core'

import {
    BeforeStartEventParams,
    Collicat,
    Drag, DragEventParams,
    DragHandlerOptions,
    DragStartEventParams, DragStopEventParams,
    GhostProxyGenerator
} from "./collicat"

function _isInsideParent(instance:BrowserJsPlumbInstance, _el:HTMLElement, pos:PointXY):boolean {
    const p = <any>_el.parentNode,
        s = instance.getSize(p),
        ss = instance.getSize(_el),
        leftEdge = pos.x,
        rightEdge = leftEdge + ss.w,
        topEdge = pos.y,
        bottomEdge = topEdge + ss.h

    return rightEdge > 0 && leftEdge < s.w && bottomEdge > 0 && topEdge < s.h
}

export const CLASS_DRAG_SELECTED = "jtk-drag-selected"
export const CLASS_DRAG_ACTIVE = "jtk-drag-active"
export const CLASS_DRAGGED = "jtk-dragged"
export const CLASS_DRAG_HOVER = "jtk-drag-hover"
export const ATTR_NOT_DRAGGABLE = "jtk-not-draggable"
export const EVENT_DRAG_MOVE = "drag:move"
export const EVENT_DRAG_STOP = "drag:stop"
export const EVENT_DRAG_START = "drag:start"
export const EVENT_MOUSEDOWN = "mousedown"
export const EVENT_MOUSEMOVE = "mousemove"
export const EVENT_MOUSEUP = "mouseup"
export const EVENT_REVERT = "revert"
export const EVENT_ZOOM = "zoom"

export const EVENT_CONNECTION_ABORT = "connection:abort"
export const EVENT_CONNECTION_DRAG = "connection:drag"

export interface DragHandler {

    selector:string

    onStart:(params:DragStartEventParams) => boolean
    onDrag:(params:DragEventParams) => void
    onStop:(params:DragStopEventParams) => void
    onDragInit: (el:Element) => Element
    onDragAbort:(el:Element) => void

    reset:() => void
    init:(drag:Drag) => void

    onBeforeStart?:(beforeStartParams:BeforeStartEventParams) => void
}

export interface GhostProxyingDragHandler extends DragHandler {
    useGhostProxy:(container:any, dragEl:Element) => boolean
    makeGhostProxy?:GhostProxyGenerator
}

type DragFilterSpec = [ Function|string, boolean ]


export class DragManager {

    private collicat:Collicat
    private drag:Drag

    _draggables:Dictionary<any> = {}
    _dlist:Array<any> = []
    _elementsWithEndpoints:Dictionary<any> = {}
    // elementids mapped to the draggable to which they belong.
    _draggablesForElements:Dictionary<any> = {}

    handlers:Array<{handler:DragHandler, options:DragHandlerOptions}> = []

    private _filtersToAdd:Array<DragFilterSpec> = []

    constructor(protected instance:BrowserJsPlumbInstance) {

        // create a delegated drag handler
        this.collicat = new Collicat({
            zoom:this.instance.currentZoom,
            css: {
                noSelect: this.instance.dragSelectClass,
                delegatedDraggable: "jtk-delegated-draggable",
                droppable: "jtk-droppable",
                draggable: "jtk-draggable",
                drag: "jtk-drag",
                selected: "jtk-drag-selected",
                active: "jtk-drag-active",
                hover: "jtk-drag-hover",
                ghostProxy: "jtk-ghost-proxy"
            },
            revert: (dragEl:Element, pos:PointXY):boolean => {
                const _el = <any>dragEl
                // if drag el not removed from DOM (pruned by a group), and it has a group which has revert:true, then revert.
                return _el.parentNode != null && _el[PARENT_GROUP_KEY] && _el[PARENT_GROUP_KEY].revert ? !_isInsideParent(this.instance, _el, pos) : false
            }
        })

        this.instance.bind(EVENT_ZOOM, (z:number) => {
            this.collicat.setZoom(z)
        })
    }

    addHandler(handler:DragHandler, dragOptions?:DragHandlerOptions):void {
        const o = extend<DragHandlerOptions>({selector:handler.selector} as any, (dragOptions || {}) as any)

        o.start = wrap(o.start, (p:DragStartEventParams) => { return handler.onStart(p); })
        o.drag = wrap(o.drag, (p:DragEventParams) => { return handler.onDrag(p); })
        o.stop = wrap(o.stop, (p:DragStopEventParams) => { return handler.onStop(p); })
        o.beforeStart = (handler.onBeforeStart || function(p:any) {}).bind(handler)
        o.dragInit = (el:Element) => handler.onDragInit(el)
        o.dragAbort = (el:Element) => handler.onDragAbort(el)

        if ((handler as GhostProxyingDragHandler).useGhostProxy) {
            o.useGhostProxy  = (handler as GhostProxyingDragHandler).useGhostProxy
            o.makeGhostProxy  = (handler as GhostProxyingDragHandler).makeGhostProxy
        }

        if (this.drag == null) {
            this.drag = this.collicat.draggable(this.instance.getContainer(), o)
            forEach(this._filtersToAdd, (filterToAdd) => this.drag.addFilter(filterToAdd[0], filterToAdd[1]))

            this.drag.on(EVENT_REVERT, (el:Element) => {
                this.instance.revalidate(el)
            })

        } else {
            this.drag.addSelector(o)
        }

        this.handlers.push({handler:handler, options:o})

        handler.init(this.drag)
    }

    addFilter(filter:Function|string, exclude?:boolean) {
        if (this.drag == null) {
            this._filtersToAdd.push([filter, exclude === true ])
        } else {
            this.drag.addFilter(filter, exclude)
        }
    }

    removeFilter(filter:Function|string) {
        if (this.drag != null) {
            this.drag.removeFilter(filter)
        }
    }

    setFilters(filters:Array<[string, boolean]>) {
        forEach(filters, (f) => {
            this.drag.addFilter(f[0], f[1])
        })
    }

    reset():Array<[string, boolean]> {

        let out:Array<[string, boolean]> = []

        forEach(this.handlers,(p:{handler:DragHandler, options:DragHandlerOptions}) => { p.handler.reset() })

        if (this.drag != null) {
            const currentFilters = this.drag._filters

            for(let f in currentFilters) {
                out.push([f, currentFilters[f][1]])
            }
            this.collicat.destroyDraggable(this.instance.getContainer())
        }

        delete this.drag
        return out
    }

    setOption(handler:DragHandler, options:DragHandlerOptions) {
        debugger
        const handlerAndOptions = getWithFunction(this.handlers, (p) => p.handler === handler)
        if (handlerAndOptions != null) {
            extend(handlerAndOptions.options, options || {})
        }
    }

}
