export const ETSY_IMAGE_FETCH_PROXY_MESSAGE_TYPE =
  "ETSY_IMAGE_FETCH_AS_BASE64" as const;

export type EtsyImageFetchProxyRequest = {
  type: typeof ETSY_IMAGE_FETCH_PROXY_MESSAGE_TYPE;
  urls: string[];
  timeoutMs?: number;
  concurrency?: number;
};

export type EtsyImageFetchProxyFailure = {
  index: number;
  url: string;
  error: string;
};

export type EtsyImageFetchProxyResult =
  | {
      success: true;
      index: number;
      url: string;
      base64: string;
    }
  | {
      success: false;
      index: number;
      url: string;
      error: string;
    };

export type EtsyImageFetchProxySuccessResponse = {
  success: true;
  data: {
    images: string[];
    results: EtsyImageFetchProxyResult[];
    failures: EtsyImageFetchProxyFailure[];
  };
};

export type EtsyImageFetchProxyErrorResponse = {
  success: false;
  error: string;
};

export type EtsyImageFetchProxyResponse =
  | EtsyImageFetchProxySuccessResponse
  | EtsyImageFetchProxyErrorResponse;
