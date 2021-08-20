---
hide_title: true
id: util.eventgenerator.unbind
---

<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index) &gt; [@jsplumb/util](./util) &gt; [EventGenerator](./util.eventgenerator) &gt; [unbind](./util.eventgenerator.unbind)

## EventGenerator.unbind() method

Unbind the given event listener, or all listeners. If you call this method with no arguments then all event listeners are unbound.

<b>Signature:</b>

```typescript
unbind(eventOrListener?: string | Function, listener?: Function): EventGenerator;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  eventOrListener | string \| Function | Either an event name, or an event handler function |
|  listener | Function | If <code>eventOrListener</code> is defined, this is the event handler to unbind. |

<b>Returns:</b>

[EventGenerator](./util.eventgenerator)
