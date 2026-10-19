import { Exception } from "@/core/exceptions/models/ExceptionType";

export class $DataSourceResponse<T> {
    data: T | null;
    error: Exception | null;
    constructor(data: T | null, error: Exception | null) {
        this.data = data;
        this.error = error;
    }
}
