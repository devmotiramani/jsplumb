---
hide_title: true
id: core.straightsegment
---

<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index) &gt; [@jsplumb/core](./core) &gt; [StraightSegment](./core.straightsegment)

## StraightSegment class

<b>Signature:</b>

```typescript
export declare class StraightSegment extends AbstractSegment 
```
<b>Extends:</b> AbstractSegment

## Constructors

|  Constructor | Modifiers | Description |
|  --- | --- | --- |
|  [(constructor)(params)](./core.straightsegment._constructor_) |  | Constructs a new instance of the <code>StraightSegment</code> class |

## Properties

|  Property | Modifiers | Type | Description |
|  --- | --- | --- | --- |
|  [length](./core.straightsegment.length) |  | number |  |
|  [m](./core.straightsegment.m) |  | number |  |
|  [m2](./core.straightsegment.m2) |  | number |  |
|  [segmentType](./core.straightsegment.segmenttype) | <code>static</code> | string |  |
|  [type](./core.straightsegment.type) |  | string |  |
|  [x1](./core.straightsegment.x1) |  | number |  |
|  [x2](./core.straightsegment.x2) |  | number |  |
|  [y1](./core.straightsegment.y1) |  | number |  |
|  [y2](./core.straightsegment.y2) |  | number |  |

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [boxIntersection(x, y, w, h)](./core.straightsegment.boxintersection) |  | Calculates all intersections of the given box with this segment. By default this method simply calls <code>lineIntersection</code> with each of the four faces of the box; subclasses can override this if they think there's a faster way to compute the entire box at once. |
|  [findClosestPointOnPath(x, y)](./core.straightsegment.findclosestpointonpath) |  | Function: findClosestPointOnPath Finds the closest point on this segment to \[x,y\]. See notes on this method in AbstractSegment. |
|  [getGradient()](./core.straightsegment.getgradient) |  |  |
|  [getLength()](./core.straightsegment.getlength) |  |  |
|  [getPath(isFirstSegment)](./core.straightsegment.getpath) |  |  |
|  [gradientAtPoint(location, absolute)](./core.straightsegment.gradientatpoint) |  | returns the gradient of the segment at the given point - which for us is constant. |
|  [lineIntersection(\_x1, \_y1, \_x2, \_y2)](./core.straightsegment.lineintersection) |  | Calculates all intersections of the given line with this segment. |
|  [pointAlongPathFrom(location, distance, absolute)](./core.straightsegment.pointalongpathfrom) |  | returns the point on the segment's path that is 'distance' along the length of the path from 'location', where 'location' is a decimal from 0 to 1 inclusive, and 'distance' is a number of pixels. this hands off to jsPlumbUtil to do the maths, supplying two points and the distance. |
|  [pointOnPath(location, absolute)](./core.straightsegment.pointonpath) |  | returns the point on the segment's path that is 'location' along the length of the path, where 'location' is a decimal from 0 to 1 inclusive. for the straight line segment this is simple maths. |
