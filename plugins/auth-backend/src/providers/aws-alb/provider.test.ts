/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { getVoidLogger } from '@backstage/backend-common';
import express from 'express';
import { JWT } from 'jose';

import { AwsAlbAuthProvider } from './provider';
import { AuthResponse } from '../types';

const jwtMock = JWT as jest.Mocked<any>;

const mockKey = async () => {
  return `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEnuN4LlaJhaUpx+qZFTzYCrSBLk0I
yOlxJ2VW88mLAQGJ7HPAvOdylxZsItMnzCuqNzZvie8m/NJsOjhDncVkrw==
-----END PUBLIC KEY-----
`;
};

jest.mock('jose');

jest.mock('cross-fetch', () => ({
  __esModule: true,
  default: async () => {
    return {
      text: async () => {
        return mockKey();
      },
    };
  },
}));

const identityResolutionCallbackMock = async (): Promise<AuthResponse<any>> => {
  return {
    backstageIdentity: {
      id: 'foo',
      idToken: '',
    },
    profile: {
      displayName: 'Foo Bar',
    },
    providerInfo: {},
  };
};

const identityResolutionCallbackRejectedMock = async (): Promise<
  AuthResponse<any>
> => {
  throw new Error('failed');
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AwsALBAuthProvider', () => {
  const catalogApi = {
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    addLocation: jest.fn(),
    getEntities: jest.fn(),
    getLocationByEntity: jest.fn(),
    getLocationById: jest.fn(),
    removeEntityByUid: jest.fn(),
    getEntityByName: jest.fn(),
  };

  const mockResponseSend = jest.fn();
  const mockRequest = ({
    header: jest.fn(() => {
      return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImZvbyIsImlzc3VlciI6ImZvbyJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.zUkMYAuMwC1T0tyHMpxXrkbFDa4aGhB8d9um_tI2hsI';
    }),
  } as unknown) as express.Request;
  const mockRequestWithoutJwt = ({
    header: jest.fn(() => {
      return undefined;
    }),
  } as unknown) as express.Request;
  const mockResponse = ({
    header: () => jest.fn(),
    send: mockResponseSend,
  } as unknown) as express.Response;

  describe('should transform to type OAuthResponse', () => {
    it('when JWT is valid and identity is resolved successfully', async () => {
      const provider = new AwsAlbAuthProvider(getVoidLogger(), catalogApi, {
        region: 'us-west-2',
        identityResolutionCallback: identityResolutionCallbackMock,
        issuer: 'foo',
      });

      jwtMock.verify.mockImplementationOnce(() => ({
        sub: 'foo',
      }));

      await provider.refresh(mockRequest, mockResponse);

      expect(mockResponseSend.mock.calls[0][0]).toEqual({
        backstageIdentity: {
          id: 'foo',
          idToken: '',
        },
        profile: {
          displayName: 'Foo Bar',
        },
        providerInfo: {},
      });
    });
  });
  describe('should fail when', () => {
    it('JWT is missing', async () => {
      const provider = new AwsAlbAuthProvider(getVoidLogger(), catalogApi, {
        region: 'us-west-2',
        identityResolutionCallback: identityResolutionCallbackMock,
        issuer: 'foo',
      });

      await provider.refresh(mockRequestWithoutJwt, mockResponse);

      expect(mockResponseSend.mock.calls[0][0]).toEqual(401);
    });

    it('JWT is invalid', async () => {
      const provider = new AwsAlbAuthProvider(getVoidLogger(), catalogApi, {
        region: 'us-west-2',
        identityResolutionCallback: identityResolutionCallbackMock,
        issuer: 'foo',
      });

      jwtMock.verify.mockImplementationOnce(() => {
        throw new Error('bad JWT');
      });

      await provider.refresh(mockRequest, mockResponse);

      expect(mockResponseSend.mock.calls[0][0]).toEqual(401);
    });

    it('issuer is invalid', async () => {
      const provider = new AwsAlbAuthProvider(getVoidLogger(), catalogApi, {
        region: 'us-west-2',
        identityResolutionCallback: identityResolutionCallbackMock,
        issuer: 'foobar',
      });

      jwtMock.verify.mockReturnValueOnce({});

      await provider.refresh(mockRequest, mockResponse);

      expect(mockResponseSend.mock.calls[0][0]).toEqual(401);
    });

    it('identity resolution callback rejects', async () => {
      const provider = new AwsAlbAuthProvider(getVoidLogger(), catalogApi, {
        region: 'us-west-2',
        identityResolutionCallback: identityResolutionCallbackRejectedMock,
        issuer: 'foo',
      });

      jwtMock.verify.mockReturnValueOnce({});

      await provider.refresh(mockRequest, mockResponse);

      expect(mockResponseSend.mock.calls[0][0]).toEqual(401);
    });
  });
});
