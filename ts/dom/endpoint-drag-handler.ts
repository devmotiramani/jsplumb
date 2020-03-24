import { CLASS_DRAG_ACTIVE, CLASS_DRAG_HOVER, DragHandler, EVT_MOUSEDOWN, EVT_MOUSEUP } from "./drag-manager";
import {BrowserJsPlumbInstance} from "./browser-jsplumb-instance";
import {Connection} from "../connector/connection-impl";
import {Endpoint} from "../endpoint/endpoint-impl";
import {addToList, each, findWithFunction, functionChain, IS, isString} from "../util";
import {Dictionary, extend, jsPlumbInstance} from "../core";
import {Anchor} from "../anchor/anchor";
import {PaintStyle} from "../styles";
import { FloatingAnchor } from "../anchor/floating-anchor";
import {EndpointRepresentation} from "../endpoint/endpoints";
import {SvgEndpoint} from "./svg-element-endpoint";
import {consume, findParent} from "../browser-util";
import * as Constants from "../constants";
import {EVENT_MAX_CONNECTIONS} from "../constants";
import {intersects} from "../geom";

function _makeFloatingEndpoint (paintStyle:PaintStyle, referenceAnchor:Anchor, endpoint:Endpoint<HTMLElement>, referenceCanvas:HTMLElement, sourceElement:HTMLElement, instance:BrowserJsPlumbInstance, scope?:string) {
    let floatingAnchor = new FloatingAnchor(instance, { reference: referenceAnchor, referenceCanvas: referenceCanvas });
    //setting the scope here should not be the way to fix that mootools issue.  it should be fixed by not
    // adding the floating endpoint as a droppable.  that makes more sense anyway!
    // TRANSIENT MANAGE
    let ep = instance.newEndpoint({
        paintStyle: paintStyle,
        endpoint: endpoint,
        anchor: floatingAnchor,
        source: sourceElement,
        scope: scope
    });
    ep.paint({});
    return ep;
}

function selectorFilter (evt:Event, _el:HTMLElement, selector:string, _instance:jsPlumbInstance<HTMLElement>, negate?:boolean):boolean {
    let t = evt.target || evt.srcElement,
        ok = false,
        sel = _instance.getSelector(_el, selector);

    for (let j = 0; j < sel.length; j++) {
        if (sel[j] === t) {
            ok = true;
            break;
        }
    }
    return negate ? !ok : ok;
}

export class EndpointDragHandler implements DragHandler {

    jpc:Connection<HTMLElement>;
    existingJpc:boolean;

    ep:Endpoint<HTMLElement>;
    endpointRepresentation:EndpointRepresentation<HTMLElement, any>;

    existingJpcParams:any;
    placeholderInfo:any = { id: null, element: null };
    floatingElement:HTMLElement;
    floatingEndpoint:Endpoint<HTMLElement>;
    _stopped:boolean;
    inPlaceCopy:any;
    endpointDropTargets:Array<any> = [];
    currentDropTarget:any = null;
    payload:any;
    floatingConnections:Dictionary<Connection<HTMLElement>> = {};

    _forceReattach:boolean;
    _forceDetach:boolean;

    _mousedownHandler:(e:any) => void;
    _mouseupHandler:(e:any) => void;

    constructor(protected instance:BrowserJsPlumbInstance) {

        const container = instance.getContainer();
        let self = this;

        this._mousedownHandler = function(e:any) {

            if (e.which === 3 || e.button === 2) {
                return;
            }

            let targetEl:any = findParent(e.target || e.srcElement, "[jtk-managed]", container);

            if (targetEl == null) {
                return;
            }

            let elid = instance.getId(targetEl),
                sourceDef = self._getSourceDefinition(targetEl, e),
                sourceElement = e.currentTarget,
                def;

            if (sourceDef) {

                consume(e);

                def = sourceDef.def;
                // if maxConnections reached
                let sourceCount = instance.select({source: elid}).length;
                if (sourceDef.maxConnections >= 0 && (sourceCount >= sourceDef.maxConnections)) {
                    consume(e);
                    if (def.onMaxConnections) {
                        def.onMaxConnections({
                            element: self,
                            maxConnections: sourceDef.maxConnections
                        }, e);
                    }
                    e.stopImmediatePropagation && e.stopImmediatePropagation();
                    return false;
                }

                // find the position on the element at which the mouse was pressed; this is where the endpoint
                // will be located.
                let elxy = instance.getPositionOnElement(e, targetEl, instance.getZoom());

                // we need to override the anchor in here, and force 'isSource', but we don't want to mess with
                // the params passed in, because after a connection is established we're going to reset the endpoint
                // to have the anchor we were given.
                let tempEndpointParams:any = {};
                extend(tempEndpointParams, def);
                tempEndpointParams.isTemporarySource = true;
                tempEndpointParams.anchor = [ elxy[0], elxy[1] , 0, 0];

                if (def.scope) {
                    tempEndpointParams.scope = def.scope;
                }

                this.ep = instance.addEndpoint(elid, tempEndpointParams);
                this.ep.deleteOnEmpty = true;
                // keep a reference to the anchor we want to use if the connection is finalised.
                this.ep._originalAnchor = def.anchor || instance.Defaults.anchor;

                // if unique endpoint and it's already been created, push it onto the endpoint we create. at the end
                // of a successful connection we'll switch to that endpoint.
                // TODO this is the same code as the programmatic endpoints create on line 1050 ish
                if (def.uniqueEndpoint) {
                    if (!def.endpoint) {
                        def.endpoint = this.ep;
                        this.ep.deleteOnEmpty = false;
                    }
                    else {
                        this.ep.finalEndpoint = def.endpoint;
                    }
                }

                // add to the list of endpoints that are a candidate for deletion if no activity has occurred on them.
                sourceElement._jsPlumbOrphanedEndpoints = sourceElement._jsPlumbOrphanedEndpoints || [];
                sourceElement._jsPlumbOrphanedEndpoints.push(this.ep);

                // optionally check for attributes to extract from the source element
                let payload = {};
                if (def.extract) {
                    for (let att in def.extract) {
                        let v = targetEl.getAttribute(att);
                        if (v) {
                            payload[def.extract[att]] = v;
                        }
                    }
                }

                // and then trigger its mousedown event, which will kick off a drag, which will start dragging
                // a new connection from this endpoint.
                instance.trigger(this.ep.endpoint.renderer.getElement(), EVT_MOUSEDOWN, e, payload);

                consume(e);
            }

        };

        instance.on(container , EVT_MOUSEDOWN, "[jtk-source]", this._mousedownHandler);

        //
        // cleans up any endpoints added from a mousedown on a source that did not result in a connection drag
        // replaces what in previous versions was a mousedown/mouseup handler per element.
        //
        this._mouseupHandler = (e:Event) => {
            console.log("a mouse up event occurred on a source element");
            console.dir(e);
            let el:any = e.currentTarget || e.srcElement;
            if (el._jsPlumbOrphanedEndpoints) {
                each(el._jsPlumbOrphanedEndpoints, (ep:any) => {
                    if (!ep.deleteOnEmpty && ep.connections.length === 0) {
                        instance.deleteEndpoint(ep);
                    }
                });

                el._jsPlumbOrphanedEndpoints.length = 0;
            }
        };
        instance.on(container, "mouseup", "[jtk-source]", this._mouseupHandler);

    }

    _makeDraggablePlaceholder(ipco:any, ips:any):HTMLElement {

        this.placeholderInfo = this.placeholderInfo || {};

        let n = this.instance.createElement("div", { position : "absolute" });
        this.instance.appendElement(n);
        let id = this.instance.getId(n);
        this.instance.setPosition(n, ipco);
        n.style.width = ips[0] + "px";
        n.style.height = ips[1] + "px";
        this.instance.manage(n); // TRANSIENT MANAGE
        // create and assign an id, and initialize the offset.
        this.placeholderInfo.id = id;
        this.placeholderInfo.element = n;
        return n;
    }

    _cleanupDraggablePlaceholder() {
        if (this.placeholderInfo.element) {
            this.instance.unmanage(this.placeholderInfo.id);
            this.instance.removeElement(this.placeholderInfo.element);
            delete this.placeholderInfo.element;
            delete this.placeholderInfo.id;
        }
    }

    reset() {
        this.instance.off(this.instance.getContainer(), EVT_MOUSEUP, this._mouseupHandler);
        this.instance.off(this.instance.getContainer(), EVT_MOUSEDOWN, this._mousedownHandler);
    }

    init(katavorioDraggable:any) {}

    selector: string = ".jtk-endpoint";

    onStart(p:any):boolean {
    
        this.currentDropTarget = null;

        this._stopped = false;

        let dragEl = p.drag.getDragElement();

        this.endpointRepresentation = dragEl.jtk.endpoint;
        this.ep = dragEl.jtk.endpoint.endpoint;

        if (!this.ep) {
            return false;
        }
        
        this.jpc = this.ep.connectorSelector();
        
        // -------------------------------- now a bunch of tests about whether or not to proceed -------------------------
        
        let _continue = true;
        // if not enabled, return
        if (!this.ep.isEnabled()) {
            _continue = false;
        }
        // if no connection and we're not a source - or temporarily a source, as is the case with makeSource - return.
        if (this.jpc == null && !this.ep.isSource && !this.ep.isTemporarySource) {
            _continue = false;
        }
        // otherwise if we're full and not allowed to drag, also return false.
        if (this.ep.isSource && this.ep.isFull() && !(this.jpc != null && this.ep.dragAllowedWhenFull)) {
            _continue = false;
        }
        // if the connection was setup as not detachable or one of its endpoints
        // was setup as connectionsDetachable = false, or Defaults.connectionsDetachable
        // is set to false...
        if (this.jpc != null && !this.jpc.isDetachable(this.ep)) {
            // .. and the endpoint is full
            if (this.ep.isFull()) {
                _continue = false;
            } else {
                // otherwise, if not full, set the connection to null, and we will now proceed
                // to drag a new connection.
                this.jpc = null;
            }
        }
        
        let beforeDrag = this.instance.checkCondition(this.jpc == null ? "beforeDrag" : "beforeStartDetach", {
            endpoint:this.ep,
            source:this.ep.element,
            sourceId:this.ep.elementId,
            connection:this.jpc
        });
        if (beforeDrag === false) {
            _continue = false;
        }
        // else we might have been given some data. we'll pass it in to a new connection as 'data'.
        // here we also merge in the optional payload we were given on mousedown.
        else if (typeof beforeDrag === "object") {
            extend(beforeDrag, this.payload || {});
        }
        else {
            // or if no beforeDrag data, maybe use the payload on its own.
            beforeDrag = this.payload || {};
        }
        
        if (_continue === false) {
            this._stopped = true;
            return false;
        }
        
        // ---------------------------------------------------------------------------------------------------------------------
        
        // ok to proceed.
        
        // clear hover for all connections for this endpoint before continuing.
        for (let i = 0; i < this.ep.connections.length; i++) {
            this.ep.connections[i].setHover(false);
        }
        
        // clear this list. we'll reconstruct it based on whether its an existing or new connection.s
        this.endpointDropTargets.length = 0;
        
        this.ep.addClass("endpointDrag");
        this.instance.isConnectionBeingDragged = true;
        
        // if we're not full but there was a connection, make it null. we'll create a new one.
        if (this.jpc && !this.ep.isFull() && this.ep.isSource) {
            this.jpc = null;
        }

        this.instance.updateOffset({ elId: this.ep.elementId });
        
        // ----------------    make the element we will drag around, and position it -----------------------------
        
        const canvasElement = (<unknown>(this.endpointRepresentation as any).canvas) as HTMLElement,
            ipco = this.instance.getOffset(canvasElement),
            ips = this.instance.getSize(canvasElement);
        
        this._makeDraggablePlaceholder(ipco, ips);
        
        // store the id of the dragging div and the source element. the drop function will pick these up.
        this.instance.setAttributes(canvasElement, {
            "dragId": this.placeholderInfo.id,
            "elId": this.ep.elementId
        });
        
        // ------------------- create an endpoint that will be our floating endpoint ------------------------------------
        
        let endpointToFloat = this.ep.dragProxy || this.ep.endpoint;
        if (this.ep.dragProxy == null && this.ep.connectionType != null) {
            const aae = this.instance.deriveEndpointAndAnchorSpec(this.ep.connectionType);
            if (aae.endpoints[1]) {
                endpointToFloat = aae.endpoints[1];
            }
        }
        const centerAnchor = this.instance.makeAnchor("Center");
        centerAnchor.isFloating = true;

        this.floatingEndpoint = _makeFloatingEndpoint(this.ep.getPaintStyle(), centerAnchor, endpointToFloat, canvasElement, this.placeholderInfo.element, this.instance, this.ep.scope);
        const _savedAnchor = this.floatingEndpoint.anchor;
        this.floatingEndpoint.deleteOnEmpty = true;
        this.floatingElement = (this.floatingEndpoint.endpoint as any).canvas;
        
        const scope = this.ep._jsPlumb.scope;
        
        let boundingRect;
        // get the list of potential drop targets for this endpoint, which excludes the source of the new connection.
        this.instance.getContainer().querySelectorAll(".jtk-endpoint[jtk-scope-" + this.ep.scope + "]").forEach((candidate:any) => {
        //this.instance.getSelector(this.instance.getContainer(), ".jtk-endpoint[jtk-scope-" + this.ep.scope + "]").forEach((candidate:any) => {
            //if (candidate !== this.ep.canvas && candidate !== _currentInstance.floatingEndpoint.canvas) {
            if ((this.jpc != null || candidate !== canvasElement) && candidate !== this.floatingElement) {
                const o = this.instance.getOffset(candidate), s = this.instance.getSize(candidate);
                boundingRect = { x:o.left, y:o.top, w:s[0], h:s[1]};
                this.endpointDropTargets.push({el:candidate, r:boundingRect, endpoint:candidate.jtk.endpoint});
                this.instance.addClass(candidate, /*this.instance.Defaults.dropOptions.activeClass ||*/ "jtk-drag-active"); // TODO get from defaults.
            }
        });
        
        // at this point we are in fact uncertain about whether or not the given endpoint is a source/target. it may not have been
        // specifically configured as one
        let selectors = [ ];//,
        // this.epIsSource = this.ep.isSource || (existingthis.jpc && this.jpc.endpoints[0] === this.ep),
        // this.epIsTarget = this.ep.isTarget || (existingthis.jpc && this.jpc.endpoints[1] === this.ep);
        
        // if (this.epIsSource) {
        selectors.push("[jtk-target][jtk-scope-" + this.ep.scope + "]");
        //}
        //if (this.epIsTarget) {
        selectors.push("[jtk-source][jtk-scope-" + this.ep.scope + "]");
        //}

        //this.instance.getSelector(this.instance.getContainer(), selectors.join(",")).forEach((candidate:any) => {
        this.instance.getContainer().querySelectorAll(selectors.join(",")).forEach((candidate:any) => {

            //if (candidate !== this.ep.element) {
                const o = this.instance.getOffset(candidate), s = this.instance.getSize(candidate);
                boundingRect = {x: o.left, y: o.top, w: s[0], h: s[1]};
                let d: any = {el: candidate, r: boundingRect};
                // targetDefinitionIdx = -1,
                // sourceDefinitionIdx = -1;

                //  if (this.epIsSource) {
                // look for at least one target definition that is not disabled on the given element.
                let targetDefinitionIdx = findWithFunction(candidate._jsPlumbTargetDefinitions, (tdef: any) => {
                    return tdef.enabled !== false;
                });
                //}

                //if (this.epIsTarget) {
                // look for at least one target definition that is not disabled on the given element.
                let sourceDefinitionIdx = findWithFunction(candidate._jsPlumbSourceDefinitions, (tdef: any) => {
                    return tdef.enabled !== false;
                });
                //}

                // if there is at least one enabled target definition (if appropriate), add this element to the drop targets
                if (targetDefinitionIdx !== -1) {
                    if (candidate._jsPlumbTargetDefinitions[targetDefinitionIdx].def.rank != null) {
                        d.rank = candidate._jsPlumbTargetDefinitions[targetDefinitionIdx].def.rank;
                    }
                    this.endpointDropTargets.push(d);
                    this.instance.addClass(candidate, /*this.instance.Defaults.dropOptions.activeClass || */"jtk-drag-active"); // TODO get from defaults.
                }

                // if there is at least one enabled source definition (if appropriate), add this element to the drop targets
                if (sourceDefinitionIdx !== -1) {
                    if (candidate._jsPlumbSourceDefinitions[sourceDefinitionIdx].def.rank != null) {
                        d.rank = candidate._jsPlumbSourceDefinitions[sourceDefinitionIdx].def.rank;
                    }
                    this.endpointDropTargets.push(d);
                    this.instance.addClass(candidate, /*this.instance.Defaults.dropOptions.activeClass ||*/ "jtk-drag-active"); // TODO get from defaults.
                }
            //}
        
        });

        this.endpointDropTargets.sort((a:any, b:any) =>{

            if (a.el[Constants.IS_GROUP_KEY] && !b.el[Constants.IS_GROUP_KEY]) {
                return 1;
            } else if (!a.el[Constants.IS_GROUP_KEY] && b.el[Constants.IS_GROUP_KEY]) {
                return -1;
            } else {
                if (a.rank != null && b.rank != null) {
                    if(a.rank > b.rank) {
                        return -1;
                    } else if (a.rank < b.rank) {
                        return 1;
                    } else {

                    }
                } else {
                    return 0;
                }
            }

        });
        
        this.ep.setHover(false, false);
        
        if (this.jpc == null) {
            
            // create a connection. one end is this endpoint, the other is a floating endpoint.
            // TODO - get
            this.jpc = this.instance._newConnection({
                sourceEndpoint: this.ep,
                targetEndpoint: this.floatingEndpoint,
                source: this.ep.element,  // for makeSource with parent option.  ensure source element is rthis.epresented correctly.
                target: this.placeholderInfo.element,
                anchors: [ this.ep.anchor, this.floatingEndpoint.anchor ],
                paintStyle: this.ep.connectorStyle, // this can be null. Connection will use the default.
                hoverPaintStyle: this.ep.connectorHoverStyle,
                connector: this.ep.connector, // this can also be null. Connection will use the default.
                overlays: this.ep.connectorOverlays,
                type: this.ep.connectionType,
                cssClass: this.ep.connectorClass,
                hoverClass: this.ep.connectorHoverClass,
                scope:scope,
                data:beforeDrag
            });
            this.jpc.pending = true;
            this.jpc.addClass(this.instance.draggingClass);
            this.floatingEndpoint.addClass(this.instance.draggingClass);
            this.floatingEndpoint.anchor = _savedAnchor;
            // fire an event that informs that a connection is being dragged
            this.instance.fire("connectionDrag", this.jpc);
        
            // register the new connection on the drag manager. This connection, at this point, is 'pending',
            // and has as its target a temporary element (the 'placeholder'). If the connection subsequently
            // becomes established, the anchor manager is informed that the target of the connection has
            // changed.
        
            // TODO is this still necessary.
            this.instance.anchorManager.newConnection(this.jpc);
        
        } else {
        
        
            // get the list of potential drop targets for this endpoint, which includes the this.ep from which the connection has been dragged?
            // TODO
            // Array.prototype.push.apply(endpointDropTargets, _currentInstance.getSelector(_currentInstance.getContainer(), ".jtk-endpoint[jtk-scope-" + this.ep.scope + "]"));
            // endpointDropTargets = endpointDropTargets.filter(function(candidate) { return candidate !== this.ep.canvas; });
            // console.log(endpointDropTargets);
        
            this.existingJpc = true;
            this.jpc.setHover(false);
            // new anchor idx
            const anchorIdx = this.jpc.endpoints[0].id === this.ep.id ? 0 : 1;

            // detach from the connection while dragging is occurring. but dont cleanup automatically.
            this.ep.detachFromConnection(this.jpc, null, true);
            // attach the connection to the floating endpoint.
            this.floatingEndpoint.addConnection(this.jpc);

            // store the original scope (issue 57)
            const dragScope = this.instance.getDragScope(canvasElement);
            console.log("TODO: investigate if original drag scope needs to be retained");
            //this.instance.setAttribute(this.ep.endpoint.renderer.getElement(), "originalScope", dragScope);
        
            // fire an event that informs that a connection is being dragged. we do this before
            // replacing the original target with the floating element info.
            this.instance.fire("connectionDrag", this.jpc);
        
            // now we replace ourselves with the temporary div we created above:
            if (anchorIdx === 0) {
                this.existingJpcParams = [ this.jpc.source, this.jpc.sourceId, canvasElement, dragScope ];
                this.instance.sourceChanged(this.jpc.endpoints[anchorIdx].elementId, this.placeholderInfo.id, this.jpc, this.placeholderInfo.element);
        
            } else {
                this.existingJpcParams = [ this.jpc.target, this.jpc.targetId, canvasElement, dragScope ];
                this.jpc.target = this.placeholderInfo.element;
                this.jpc.targetId = this.placeholderInfo.id;

                this.jpc.updateConnectedClass();
            }
        
            // store the original endpoint and assign the new floating endpoint for the drag.
            this.jpc.suspendedEndpoint = this.jpc.endpoints[anchorIdx];
        
            // PROVIDE THE SUSPENDED ELEMENT, BE IT A SOURCE OR TARGET (ISSUE 39)
            this.jpc.suspendedElement = this.jpc.endpoints[anchorIdx].element;
            this.jpc.suspendedElementId = this.jpc.endpoints[anchorIdx].elementId;
            this.jpc.suspendedElementType = anchorIdx === 0 ? "source" : "target";
        
            this.jpc.suspendedEndpoint.setHover(false);
            this.floatingEndpoint.referenceEndpoint = this.jpc.suspendedEndpoint;
            this.jpc.endpoints[anchorIdx] = this.floatingEndpoint;
        
            this.jpc.addClass(this.instance.draggingClass);
        
            this.jpc.floatingIndex = anchorIdx;
            this.jpc.floatingEndpoint = this.floatingEndpoint;
            this.jpc.floatingId = this.placeholderInfo.id;
            this.jpc.floatingEndpoint.addClass(this.instance.draggingClass);
        }

        this._registerFloatingConnection(this.placeholderInfo, this.jpc, this.floatingEndpoint);
        
        // tell jsplumb about it
        this.instance.currentlyDragging = true;
        
    }

    onBeforeStart (beforeStartParams:any):void {
        this.payload = beforeStartParams.e.payload || {};
    }
    
    onDrag (params:any) {
        if (this._stopped) {
            return true;
        }

        if (this.placeholderInfo.element) {

            let floatingElementSize = this.instance.getSize(this.floatingElement);
            let _ui = { left:params.pos[0], top:params.pos[1]};
            this.instance.repaint(this.placeholderInfo.element, _ui);

            let boundingRect = { x:params.pos[0], y:params.pos[1], w:floatingElementSize[0], h:floatingElementSize[1]},
                newDropTarget, idx, _cont;

            for (let i = 0; i < this.endpointDropTargets.length; i++) {

                if (intersects(boundingRect, this.endpointDropTargets[i].r)) {
                    newDropTarget = this.endpointDropTargets[i];
                    break;
                }
            }

            if (newDropTarget !== this.currentDropTarget && this.currentDropTarget != null) {
                idx = this.getFloatingAnchorIndex(this.jpc);

                this.instance.removeClass(this.currentDropTarget.el, CLASS_DRAG_HOVER);

                if (this.currentDropTarget.endpoint) {
                    this.currentDropTarget.endpoint.endpoint.removeClass(this.instance.endpointDropAllowedClass);
                    this.currentDropTarget.endpoint.endpoint.removeClass(this.instance.endpointDropForbiddenClass);
                }

                this.jpc.endpoints[idx].anchor.out();
            }

            if (newDropTarget != null) {
                this.instance.addClass(newDropTarget.el, CLASS_DRAG_HOVER);

                idx = this.getFloatingAnchorIndex(this.jpc);

                if (newDropTarget.endpoint != null) {

                    _cont = (newDropTarget.endpoint.endpoint.isTarget && idx !== 0) || (this.jpc.suspendedEndpoint && newDropTarget.endpoint.endpoint.referenceEndpoint && newDropTarget.endpoint.endpoint.referenceEndpoint.id === this.jpc.suspendedEndpoint.id);
                    if (_cont) {
                        let bb = this.instance.checkCondition("checkDropAllowed", {
                            sourceEndpoint: this.jpc.endpoints[idx],
                            targetEndpoint: newDropTarget.endpoint.endpoint,
                            connection: this.jpc
                        });

                        // this.instance.renderer[(bb ? "addEndpoint" : "removeEndpoint") + "Class"](newDropTarget.endpoint, this.instance.endpointDropAllowedClass);
                        // this.instance.renderer[(bb ? "removeEndpoint" : "addEndpoint") + "Class"](newDropTarget.endpoint, this.instance.endpointDropForbiddenClass);

                        newDropTarget.endpoint.endpoint[(bb ? "add" : "remove") + "Class"](this.instance.endpointDropAllowedClass);
                        newDropTarget.endpoint.endpoint[(bb ? "remove" : "add") + "Class"](this.instance.endpointDropForbiddenClass);

                        this.jpc.endpoints[idx].anchor.over(newDropTarget.endpoint.endpoint.anchor, newDropTarget.endpoint.endpoint);
                    }
                }
            }

            this.currentDropTarget = newDropTarget;

            // always repaint the source endpoint, because only continuous/dynamic anchors cause the endpoint
            // to be repainted, so static anchors need to be told (or the endpoint gets dragged around)
            this.ep.paint({anchorLoc:this.ep.anchor.getCurrentLocation({element:this.ep})});
        }
    }

    maybeCleanup (ep:Endpoint<HTMLElement>):void {
        if ((<any>ep)._mtNew && ep.connections.length === 0) {
            this.instance.deleteObject({endpoint: ep});
        }
        else {
            delete (<any>ep)._mtNew;
        }
    }

    private _reattachOrDiscard(originalEvent: Event) {

        let existingConnection = this.jpc.suspendedEndpoint != null;
        let idx = this.getFloatingAnchorIndex(this.jpc);

        // if no drop target,
        if (existingConnection && this._shouldReattach(originalEvent)) {

            if (idx === 0) {
                this.jpc.source = this.jpc.suspendedElement;
                this.jpc.sourceId = this.jpc.suspendedElementId;
            } else {
                this.jpc.target = this.jpc.suspendedElement;
                this.jpc.targetId = this.jpc.suspendedElementId;
            }

            // is this an existing connection? try to reattach, if desired.
            this._doForceReattach(idx);

        } else {
            // otherwise throw it away (and throw away any endpoints attached to it that should be thrown away when they are no longer
            // connected to any edges.
            this._discard(idx, originalEvent);
        }
    }
    
    onStop(p:any) {

        let originalEvent = p.e;
        let reattached = false;
        let aborted = false;

        console.log("drag ended on endpoint");
        this.instance.isConnectionBeingDragged = false;

        if (this.jpc && this.jpc.endpoints != null) {

            let existingConnection = this.jpc.suspendedEndpoint != null;
            let idx = this.getFloatingAnchorIndex(this.jpc);
            let suspendedEndpoint = this.jpc.suspendedEndpoint;
            let dropEndpoint;

            // 1. is there a drop target?
            if (this.currentDropTarget != null) {

                // get the drop endpoint.
                dropEndpoint = this._getDropEndpoint(p, this.jpc);
                if (dropEndpoint == null) {
                    // no drop endpoint resolved. either reattach, or discard.
                    this._reattachOrDiscard(p.e);
                } else {

                    // if we are dropping back on the original endpoint, force a reattach.
                    if (suspendedEndpoint && (suspendedEndpoint.id === dropEndpoint.id)) {
                        this._doForceReattach(idx);
                    } else {

                        if (!dropEndpoint.isEnabled()) {
                            // if endpoint disabled, either reattach or discard
                            this._reattachOrDiscard(p.e);
                        } else if (dropEndpoint.isFull()) {
                            // if endpoint full, fire an event, then either reattach or discard
                            dropEndpoint.fire(EVENT_MAX_CONNECTIONS, {
                                endpoint: this,
                                connection: this.jpc,
                                maxConnections: this.instance.Defaults.maxConnections
                            }, originalEvent);
                            this._reattachOrDiscard(p.e);
                        } else {
                            if (idx === 0) {
                                this.jpc.floatingElement = this.jpc.source;
                                this.jpc.floatingId = this.jpc.sourceId;
                                this.jpc.floatingEndpoint = this.jpc.endpoints[0];
                                this.jpc.floatingIndex = 0;
                                this.jpc.source = dropEndpoint.element;
                                this.jpc.sourceId = dropEndpoint.elementId;
                            } else {
                                this.jpc.floatingElement = this.jpc.target;
                                this.jpc.floatingId = this.jpc.targetId;
                                this.jpc.floatingEndpoint = this.jpc.endpoints[1];
                                this.jpc.floatingIndex = 1;
                                this.jpc.target = dropEndpoint.element;
                                this.jpc.targetId = dropEndpoint.elementId;
                            }

                            let _doContinue = true;
                            /*
                                if this is an existing connection and detach is not allowed we won't continue. The connection's
                                endpoints have been reinstated; everything is back to how it was.
                            */
                            if (existingConnection && this.jpc.suspendedEndpoint.id !== dropEndpoint.id) {
                                if (!this.jpc.isDetachAllowed(this.jpc) || !this.jpc.endpoints[idx].isDetachAllowed(this.jpc) || !this.jpc.suspendedEndpoint.isDetachAllowed(this.jpc) || !this.instance.checkCondition("beforeDetach", this.jpc)) {
                                    _doContinue = false;
                                }
                            }

                            /*
                                now check beforeDrop.  this will be available only on Endpoints that are setup to
                                have a beforeDrop condition (although, secretly, under the hood all Endpoints and
                                the Connection have them, because they are on jsPlumbUIComponent.  shhh!), because
                                it only makes sense to have it on a target endpoint.
                            */
                            _doContinue = _doContinue && dropEndpoint.isDropAllowed(this.jpc.sourceId, this.jpc.targetId, this.jpc.scope, this.jpc, dropEndpoint);

                            if (_doContinue) {
                                this._drop(dropEndpoint, idx, originalEvent, _doContinue);
                            } else {
                                this._reattachOrDiscard(p.e);
                            }
                        }
                    }

                }

            } else {
                // no drop target: either reattach, or discard.
                this._reattachOrDiscard(p.e);
            }

            // common clean up

            this.instance.deleteObject({endpoint: this.floatingEndpoint});

            this._cleanupDraggablePlaceholder();

            delete this.jpc.suspendedEndpoint;
            delete this.jpc.suspendedElement;
            delete this.jpc.suspendedElementType;
            delete this.jpc.suspendedElementId;
            delete this.jpc.suspendedIndex;
            delete this.jpc.floatingElement;
            delete this.jpc.floatingEndpoint;
            delete this.jpc.floatingId;
            delete this.jpc.floatingIndex;

            if (dropEndpoint != null) {

                this.maybeCleanup(dropEndpoint);

                /* makeTarget sets this flag, to tell us we have been replaced and should delete this object. */
                if (dropEndpoint.deleteAfterDragStop) {
                    this.instance.deleteObject({endpoint: dropEndpoint});
                }
                else {
                    if (dropEndpoint._jsPlumb) {
                        dropEndpoint.paint({recalc: false});
                    }
                }
            }
        }

    }

    private _getSourceDefinition(fromElement:any, evt?:Event):any {
        let sourceDef;
        if (fromElement._jsPlumbSourceDefinitions) {
            for (let i = 0; i < fromElement._jsPlumbSourceDefinitions.length; i++) {
                sourceDef = fromElement._jsPlumbSourceDefinitions[i];
                if (sourceDef.enabled !== false) {
                    if (sourceDef.def.filter) {
                        let r = isString(sourceDef.def.filter) ? selectorFilter(evt, fromElement, sourceDef.def.filter, this.instance, sourceDef.def.filterExclude) : sourceDef.def.filter(evt, fromElement);
                        if (r !== false) {
                            return sourceDef;
                        }
                    } else {
                        return sourceDef;
                    }
                }
            }
        }
    }

    private _getTargetDefinition(fromElement:any, evt?:Event):any {
        let targetDef;
        if (fromElement._jsPlumbTargetDefinitions) {
            for (let i = 0; i < fromElement._jsPlumbTargetDefinitions.length; i++) {
                targetDef = fromElement._jsPlumbTargetDefinitions[i];
                if (targetDef.enabled !== false) {
                    if (targetDef.def.filter) {
                        let r = isString(targetDef.def.filter) ? selectorFilter(evt, fromElement, targetDef.def.filter, this.instance, targetDef.def.filterExclude) : targetDef.def.filter(evt, fromElement);
                        if (r !== false) {
                            return targetDef;
                        }
                    } else {
                        return targetDef;
                    }
                }
            }
        }
    }

    _getDropEndpoint(p:any, jpc:Connection<HTMLElement>):Endpoint<HTMLElement> {
        let dropEndpoint:Endpoint<HTMLElement>;

        if (this.currentDropTarget.endpoint == null) {

            // find a suitable target definition, by matching the source of the drop element with the targets registered on the
            // drop target, and also the floating index (if set) of the connection

            let targetDefinition = (jpc.floatingIndex == null || jpc.floatingIndex === 1) ? this._getTargetDefinition(this.currentDropTarget.el, p.e) : null;

            // need to figure the conditions under which each of these should be tested
            if (targetDefinition == null) {
                targetDefinition = (jpc.floatingIndex == null || jpc.floatingIndex === 0) ? this._getSourceDefinition(this.currentDropTarget.el, p.e) : null;
            }

            if (targetDefinition == null) {
                return null;
            }

            // if no cached endpoint, or there was one but it has been cleaned up
            // (ie. detached), create a new one
            let eps = this.instance.deriveEndpointAndAnchorSpec(jpc.getType().join(" "), true);

            let pp = eps.endpoints ? extend(p, {
                endpoint:targetDefinition.def.endpoint || eps.endpoints[1]
            }) :p;
            if (eps.anchors) {
                pp = extend(pp, {
                    anchor:targetDefinition.def.anchor || eps.anchors[1]
                });
            }
            dropEndpoint = this.instance.addEndpoint(this.currentDropTarget.el, pp) as Endpoint<HTMLElement>;
            (<any>dropEndpoint)._mtNew = true;
            dropEndpoint.deleteOnEmpty = true;

            if (dropEndpoint.anchor.positionFinder != null) {
                let dropPosition = this.instance.getUIPosition(arguments),
                    elPosition = this.instance.getOffset(this.currentDropTarget.el),
                    elSize = this.instance.getSize(this.currentDropTarget.el),
                    ap = dropPosition == null ? [0,0] : dropEndpoint.anchor.positionFinder(dropPosition, elPosition, elSize, (<any>dropEndpoint.anchor).constructorParams);

                dropEndpoint.anchor.x = ap[0];
                dropEndpoint.anchor.y = ap[1];
                // now figure an orientation for it..kind of hard to know what to do actually. probably the best thing i can do is to
                // support specifying an orientation in the anchor's spec. if one is not supplied then i will make the orientation
                // be what will cause the most natural link to the source: it will be pointing at the source, but it needs to be
                // specified in one axis only, and so how to make that choice? i think i will use whichever axis is the one in which
                // the target is furthest away from the source.
            }
        } else {
            dropEndpoint = this.currentDropTarget.endpoint.endpoint;
        }

        if (dropEndpoint) {
            dropEndpoint.removeClass(this.instance.endpointDropAllowedClass);
            dropEndpoint.removeClass(this.instance.endpointDropForbiddenClass);
        }

        return dropEndpoint;
    }

    _doForceReattach(idx:number):void {

        this.jpc.endpoints[idx].detachFromConnection(this.jpc, null, true);

        this.jpc.endpoints[idx] = this.jpc.suspendedEndpoint;
        this.jpc.setHover(false);

        this.jpc._forceDetach = true;

        if (idx === 0) {
            this.jpc.source = this.jpc.suspendedEndpoint.element;
            this.jpc.sourceId = this.jpc.suspendedEndpoint.elementId;
        } else {
            this.jpc.target = this.jpc.suspendedEndpoint.element;
            this.jpc.targetId = this.jpc.suspendedEndpoint.elementId;
        }
        this.jpc.suspendedEndpoint.addConnection(this.jpc);

        // TODO checkSanity
        if (idx === 1) {
            this.jpc.updateConnectedClass();
        }
        else {
            this.instance.sourceChanged(this.jpc.floatingId, this.jpc.sourceId, this.jpc, this.jpc.source);
        }

        this.instance.repaint(this.jpc.sourceId);

        delete this.jpc._forceDetach;
    }

    _shouldReattach(originalEvent?:Event):boolean {
        return this.jpc.isReattach() || this.jpc._forceReattach || !functionChain(true, false, [
            [ this.jpc.endpoints[0], Constants.IS_DETACH_ALLOWED, [ this.jpc ] ],
            [ this.jpc.endpoints[1], Constants.IS_DETACH_ALLOWED, [ this.jpc ] ],
            [ this.jpc, Constants.IS_DETACH_ALLOWED, [ this.jpc ] ],
            [ this.instance, Constants.CHECK_CONDITION, [ Constants.BEFORE_DETACH, this.jpc ] ]
        ]);
    }

     _maybeReattach(idx:number, originalEvent?:Event):void {

         this.jpc.setHover(false);

        if (this.jpc.suspendedEndpoint) {

            // this.jpc._forceDetach ||  <-- why was this one of the tests in the line below?
            if (this.jpc.isReattach() || this.jpc._forceReattach || !this.instance.deleteConnection(this.jpc, {originalEvent: originalEvent})) {

                let floatingId;
                this.jpc.endpoints[idx] = this.jpc.suspendedEndpoint;
                this.jpc.setHover(false);
                this.jpc._forceDetach = true;
                if (idx === 0) {
                    floatingId = this.jpc.sourceId;
                    this.jpc.source = this.jpc.suspendedEndpoint.element;
                    this.jpc.sourceId = this.jpc.suspendedEndpoint.elementId;
                } else {
                    floatingId = this.jpc.targetId;
                    this.jpc.target = this.jpc.suspendedEndpoint.element;
                    this.jpc.targetId = this.jpc.suspendedEndpoint.elementId;
                }
                this.jpc.suspendedEndpoint.addConnection(this.jpc);

                // TODO checkSanity
                if (idx === 1) {
                    this.jpc.updateConnectedClass();
                }
                else {
                    this.instance.sourceChanged(this.jpc.floatingId, this.jpc.sourceId, this.jpc, this.jpc.source);
                }

                this.instance.repaint(this.jpc.sourceId);
                this.jpc._forceDetach = false;
            }
            else {
               //this.instance.deleteObject({endpoint: this.jpc.suspendedEndpoint});
            }

        } else {

            this.instance.deleteObject({endpoint: this.jpc.endpoints[idx], originalEvent:originalEvent});

            if (this.jpc.pending) {


                // this.jpc.endpoints[idx === 1 ? 0 : 1].detachFromConnection(this.jpc);
                // this.instance.deleteObject({connection: this.jpc});

                this.instance.fire("connectionAborted", this.jpc, originalEvent);
            }
        }
    }

    private _discard(idx:number, originalEvent?:Event) {

        if (this.jpc.pending) {
            this.instance.fire("connectionAborted", this.jpc, originalEvent);
        } else {
            if (idx === 0) {
                this.jpc.source = this.jpc.suspendedEndpoint.element;
                this.jpc.sourceId = this.jpc.suspendedEndpoint.elementId;
            } else {
                this.jpc.target = this.jpc.suspendedEndpoint.element;
                this.jpc.targetId = this.jpc.suspendedEndpoint.elementId;
            }

            this.jpc.endpoints[idx] = this.jpc.suspendedEndpoint;
        }



        //this.instance.deleteObject({connection: this.jpc});
        if (this.jpc.floatingEndpoint) {
            this.jpc.floatingEndpoint.detachFromConnection(this.jpc);
            //delete this.jpc.floatingEndpoint;
        }

        this.instance.deleteObject({connection: this.jpc, originalEvent:originalEvent});
        //console.log("placeholder..we're discarding the connection here");
    }

    //
    // drops the current connection on the given endpoint
    //
    private  _drop(dropEndpoint:Endpoint<HTMLElement>, idx:number, originalEvent:Event, optionalData?:any):void {
        // remove this jpc from the current endpoint, which is a floating endpoint that we will
        // subsequently discard.
        this.jpc.endpoints[idx].detachFromConnection(this.jpc);

        // if there's a suspended endpoint, detach it from the connection.
        if (this.jpc.suspendedEndpoint) {
            this.jpc.suspendedEndpoint.detachFromConnection(this.jpc);
        }

        this.jpc.endpoints[idx] = dropEndpoint;
        dropEndpoint.addConnection(this.jpc);

        // copy our parameters in to the connection:
        let params = dropEndpoint.getParameters();
        for (let aParam in params) {
            this.jpc.setParameter(aParam, params[aParam]);
        }

        if (this.jpc.suspendedEndpoint) {
            let suspendedElementId = this.jpc.suspendedEndpoint.elementId;
            this.instance.fireMoveEvent({
                index: idx,
                originalSourceId: idx === 0 ? suspendedElementId : this.jpc.sourceId,
                newSourceId: idx === 0 ? dropEndpoint.elementId : this.jpc.sourceId,
                originalTargetId: idx === 1 ? suspendedElementId : this.jpc.targetId,
                newTargetId: idx === 1 ? dropEndpoint.elementId : this.jpc.targetId,
                originalSourceEndpoint: idx === 0 ? this.jpc.suspendedEndpoint : this.jpc.endpoints[0],
                newSourceEndpoint: idx === 0 ? dropEndpoint : this.jpc.endpoints[0],
                originalTargetEndpoint: idx === 1 ? this.jpc.suspendedEndpoint : this.jpc.endpoints[1],
                newTargetEndpoint: idx === 1 ? dropEndpoint : this.jpc.endpoints[1],
                connection: this.jpc
            }, originalEvent);
        }

        if (idx === 1) {
            this.jpc.updateConnectedClass();
        }
        else {
            this.instance.sourceChanged(this.jpc.floatingId, this.jpc.sourceId, this.jpc, this.jpc.source);
        }

        // when makeSource has uniqueEndpoint:true, we want to create connections with new endpoints
        // that are subsequently deleted. So makeSource sets `finalEndpoint`, which is the Endpoint to
        // which the connection should be attached. The `detachFromConnection` call below results in the
        // temporary endpoint being cleaned up.
        if (this.jpc.endpoints[0].finalEndpoint) {
            let _toDelete = this.jpc.endpoints[0];
            _toDelete.detachFromConnection(this.jpc);
            this.jpc.endpoints[0] = this.jpc.endpoints[0].finalEndpoint;
            this.jpc.endpoints[0].addConnection(this.jpc);
        }

        // if optionalData was given, merge it onto the connection's data.
        if (IS.anObject(optionalData)) {
            this.jpc.mergeData(optionalData);
        }

        if (this.jpc.endpoints[0]._originalAnchor) {
            let newSourceAnchor = this.instance.makeAnchor(this.jpc.endpoints[0]._originalAnchor, this.jpc.endpoints[0].elementId);
            this.jpc.endpoints[0].setAnchor(newSourceAnchor, true);
            delete this.jpc.endpoints[0]._originalAnchor;
        }

        // finalise will inform the anchor manager and also add to
        // connectionsByScope if necessary.
        this.instance._finaliseConnection(this.jpc, null, originalEvent, false);
        this.jpc.setHover(false);

        // SP continuous anchor flush
        this.instance.revalidate(this.jpc.endpoints[0].element);
    }

    _registerFloatingConnection(info:any, conn:Connection<HTMLElement>, ep:Endpoint<HTMLElement>) {


            this.floatingConnections[info.id] = conn;
            // only register for the target endpoint; we will not be dragging the source at any time
            // before this connection is either discarded or made into a permanent connection.
            addToList(this.instance.endpointsByElement, info.id, ep);

        // this.getFloatingConnectionFor = function(id) {
        //     return floatingConnections[id];
        // };
    }

    getFloatingAnchorIndex(jpc:Connection<HTMLElement>):number {
        return jpc.endpoints[0].isFloating() ? 0 : jpc.endpoints[1].isFloating() ? 1 : -1;
    }
        
}