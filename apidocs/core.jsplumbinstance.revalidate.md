---
hide_title: true
id: core.jsplumbinstance.revalidate
---

<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index) &gt; [@jsplumb/core](./core) &gt; [JsPlumbInstance](./core.jsplumbinstance) &gt; [revalidate](./core.jsplumbinstance.revalidate)

## JsPlumbInstance.revalidate() method

Updates position/size information for the given element and redraws its Endpoints and their Connections. Use this method when you've made a change to some element that may have caused the element to change its position or size and you want to ensure the connections are in the right place.  revalidate

<b>Signature:</b>

```typescript
revalidate(el: T["E"], timestamp?: string): RedrawResult;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  el | T\["E"\] | Element to revalidate. |
|  timestamp | string | Optional, used internally to avoid recomputing position/size information if it has already been computed. |

<b>Returns:</b>

[RedrawResult](./core.redrawresult)
