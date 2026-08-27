export interface SellerInfoProbe {
  httpStatus: number;
  responseOk: boolean;
  finalHost: string;
  businessCode: number | null;
  success: boolean | null;
}

export function isValidSellerInfoProbe(result: SellerInfoProbe): boolean {
  return result.responseOk &&
    result.httpStatus !== 401 &&
    result.httpStatus !== 403 &&
    result.finalHost === "ark.xiaohongshu.com" &&
    result.businessCode === 0 &&
    result.success !== false;
}
