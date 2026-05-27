export const ETSY_IMAGE_FETCH_PROXY_MESSAGE_TYPE =
  "ETSY_IMAGE_FETCH_AS_BASE64" as const;

export type EtsyImageFetchProxyRequest = {
  type: typeof ETSY_IMAGE_FETCH_PROXY_MESSAGE_TYPE;
  urls: string[];
};

export type EtsyImageFetchProxySuccessResponse = {
  success: true;
  data: {
    images: string[];
  };
};

export type EtsyImageFetchProxyErrorResponse = {
  success: false;
  error: string;
};

export type EtsyImageFetchProxyResponse =
  | EtsyImageFetchProxySuccessResponse
  | EtsyImageFetchProxyErrorResponse;
