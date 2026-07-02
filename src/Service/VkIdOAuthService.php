<?php

declare(strict_types=1);

namespace App\Service;

final class VkIdOAuthService
{
    private const TOKEN_URL = 'https://id.vk.ru/oauth2/auth';
    private const USER_URL = 'https://id.vk.ru/oauth2/user_info';

    /**
     * @return array{access_token: string, user_id?: int|string}
     */
    public function exchangeCode(
        string $code,
        string $codeVerifier,
        string $redirectUri,
        string $clientId,
        string $deviceId,
        string $state,
        ?string $serviceToken = null,
    ): array {
        $payload = [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'code_verifier' => $codeVerifier,
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'device_id' => $deviceId,
            'state' => $state,
        ];

        if ($serviceToken !== null && $serviceToken !== '') {
            $payload['service_token'] = $serviceToken;
        }

        $response = $this->post(self::TOKEN_URL, $payload);
        if (!isset($response['access_token'])) {
            throw new \RuntimeException($this->formatApiError($response, 'VK token exchange failed'));
        }

        return $response;
    }

    /**
     * @return array{user: array{user_id: int|string, first_name?: string, last_name?: string, email?: string}}
     */
    public function fetchUser(string $accessToken, string $clientId): array
    {
        $response = $this->post(self::USER_URL, [
            'access_token' => $accessToken,
            'client_id' => $clientId,
        ]);

        if (!isset($response['user']['user_id'])) {
            throw new \RuntimeException($this->formatApiError($response, 'VK user_info failed'));
        }

        return $response;
    }

    /**
     * @param array<string, mixed> $data
     *
     * @return array<string, mixed>
     */
    private function post(string $url, array $data): array
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => http_build_query($data),
                'ignore_errors' => true,
                'timeout' => 15,
            ],
        ]);

        $body = file_get_contents($url, false, $context);
        if ($body === false) {
            throw new \RuntimeException('VK API unreachable');
        }

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException('Invalid VK API response');
        }

        return $decoded;
    }

    /**
     * @param array<string, mixed> $response
     */
    private function formatApiError(array $response, string $fallback): string
    {
        $error = $response['error'] ?? null;
        $description = $response['error_description'] ?? null;

        if (is_string($error) && is_string($description)) {
            return sprintf('%s: %s (%s)', $fallback, $description, $error);
        }

        if (is_string($error)) {
            return sprintf('%s: %s', $fallback, $error);
        }

        return $fallback;
    }
}
