export type EndpointId = "Rectangle" | "Dot" | "Blank" | UserDefinedEndpointId
export type UserDefinedEndpointId = string
export type EndpointParams = any
export type FullEndpointSpec = {type:EndpointId, options:EndpointParams}
export type EndpointSpec = EndpointId | FullEndpointSpec
