import type { AxiosResponse } from "axios";

export enum ExceptionType {
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    NOT_FOUND = 'NOT_FOUND',
    BAD_REQUEST = 'BAD_REQUEST',
    INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
    SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
    GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
    CONFLICT = 'CONFLICT',
    PRECONDITION_FAILED = 'PRECONDITION_FAILED',
    UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
    FAILED = 'FAILED',
}

/** Validation issue as returned by the backend's ApiError ({ field, message }). */
export interface ValidationIssue {
    field: string;
    message: string;
}

export class Exception {
    exceptionType: ExceptionType;
    message: string;
    statusCode: number;
    issues: ValidationIssue[];

    constructor({
        exceptionType = ExceptionType.FAILED,
        message = 'An error occurred',
        statusCode = 500,
        issues = [],
    }: {
        exceptionType: ExceptionType;
        message: string;
        statusCode: number;
        issues?: ValidationIssue[];
    }) {
        this.exceptionType = exceptionType;
        this.message = message;
        this.statusCode = statusCode;
        this.issues = issues;
    }

    static interpretResponse(res: AxiosResponse): Exception {
        return new Exception({
            exceptionType: Exception.typeForStatus(res.status),
            message: res.data?.error ?? 'An error occurred',
            statusCode: res.status,
            issues: Array.isArray(res.data?.issues) ? res.data.issues : [],
        });
    }

    private static typeForStatus(status: number): ExceptionType {
        switch (status) {
            case 400: return ExceptionType.BAD_REQUEST;
            case 401: return ExceptionType.UNAUTHORIZED;
            case 403: return ExceptionType.FORBIDDEN;
            case 404: return ExceptionType.NOT_FOUND;
            case 409: return ExceptionType.CONFLICT;
            case 422: return ExceptionType.UNPROCESSABLE_ENTITY;
            case 503: return ExceptionType.SERVICE_UNAVAILABLE;
            default: return status >= 500 ? ExceptionType.INTERNAL_SERVER_ERROR : ExceptionType.FAILED;
        }
    }
}
