import { Exception, ExceptionType } from "@/core/exceptions/models/ExceptionType";
import { HttpService, RequestMethod } from "@/core/http/functions/httpService";
import { $DataSourceResponse } from "@/core/http/models/DataSourceResponseType";
import type { AxiosResponse } from "axios";

export class $Endpoint<T> {
  route: string;
  method: RequestMethod;
  pathParameters: string[] | null;
  queryParameters: any | null;
  jsonBody: any | null;
  formData: FormData | null;
  additionalHeaders: any | null;
  customBaseUrl?: string;
  //'blob' for a route that answers with a file rather than JSON.
  responseType?: 'json' | 'blob';
  responseParser: null | ((response: AxiosResponse) => T);

  constructor({
    method,
    route,
    pathParameters = null,
    queryParameters = null,
    jsonBody = null,
    formData = null,
    additionalHeaders = null,
    customBaseUrl,
    responseType,
    responseParser = null,
  }: {
    method: RequestMethod;
    route: string;
    pathParameters?: string[] | null;
    queryParameters?: any | null;
    jsonBody?: any | null;
    formData?: FormData | null;
    additionalHeaders?: any | null;
    customBaseUrl?: string;
    responseType?: 'json' | 'blob';
    responseParser: null | ((response: AxiosResponse) => T);
  }) {
    this.route = route;
    this.method = method;
    this.pathParameters = pathParameters;
    this.queryParameters = queryParameters;
    this.jsonBody = jsonBody;
    this.formData = formData;
    this.additionalHeaders = additionalHeaders;
    this.customBaseUrl = customBaseUrl;
    this.responseType = responseType;
    this.responseParser = responseParser;
  }

  async callAndParse(): Promise<$DataSourceResponse<T>> {
    if (this.responseParser == null) {
      throw new Error("Response parser is not set");
    }
    let val: T | null = null;
    let exception: Exception | null = null;
    try {
      const res = await this.call();
      // Any 2xx is a success (create routes return 201).
      if (res.status >= 200 && res.status < 300) {
        val = this.responseParser(res);
      } else {
        exception = Exception.interpretResponse(res);
      }
      return new $DataSourceResponse(val, exception);
    } catch (e) {
      const path: string =
        this.route +
        (this.pathParameters != undefined && this.pathParameters.length > 0
          ? "/" + this.pathParameters.join("/")
          : "");
      // Axios throws on non-2xx; convert so statusCode survives instead of casting the raw error.
      const axiosResponse = (e as any)?.response;
      // Name the request and the failure only. The request body (a password, a
      // link code) and the raw axios error, whose config carries that body, are
      // never logged.
      console.warn(`Request failed: ${RequestMethod[this.method]} ${path}`,
        axiosResponse != null ? `status ${axiosResponse.status}` : `(${(e as any)?.message ?? 'no response'})`);
      if (axiosResponse != null) {
        return new $DataSourceResponse<T>(null, Exception.interpretResponse(axiosResponse));
      }
      return new $DataSourceResponse<T>(null, new Exception({
        exceptionType: ExceptionType.FAILED, message: 'Network error', statusCode: 0,
      }));
    }
  }

  async callWithParser(parser: (response: AxiosResponse) => T): Promise<$DataSourceResponse<T>> {
    this.responseParser = parser;
    return this.callAndParse();
  }

  async call(): Promise<AxiosResponse> {
    const path: string =
      this.route +
      (this.pathParameters != undefined && this.pathParameters.length > 0
        ? "/" + this.pathParameters.join("/")
        : "");
    const body = this.formData || this.jsonBody;

    return HttpService.makeRequest(
      this.method,
      path,
      body,
      this.queryParameters,
      { ...this.additionalHeaders, ...(this.formData ? { 'Content-Type': 'multipart/form-data' } : {}) },
      this.customBaseUrl,
      this.responseType,
    );
  }
}
