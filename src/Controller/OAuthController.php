<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\User;
use App\Repository\UserRepository;
use App\Security\OAuthAuthenticator;
use App\Service\VkIdOAuthService;
use Doctrine\ORM\EntityManagerInterface;
use KnpU\OAuth2ClientBundle\Client\ClientRegistry;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Routing\Generator\UrlGeneratorInterface;
use Symfony\Component\Security\Http\Authentication\UserAuthenticatorInterface;

final class OAuthController extends AbstractController
{
    public function __construct(
        private readonly ClientRegistry $clients,
        private readonly UserRepository $users,
        private readonly EntityManagerInterface $entityManager,
        private readonly UserAuthenticatorInterface $userAuthenticator,
        private readonly OAuthAuthenticator $oauthAuthenticator,
        private readonly VkIdOAuthService $vkOAuth,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/auth/google', name: 'auth_google_start')]
    public function googleStart(): RedirectResponse
    {
        return $this->clients->getClient('google')->redirect(['email', 'profile'], []);
    }

    #[Route('/auth/google/callback', name: 'auth_google_callback')]
    public function googleCallback(Request $request): Response
    {
        $googleUser = $this->clients->getClient('google')->fetchUser();
        $user = $this->users->findOrCreate(
            'google',
            (string) $googleUser->getId(),
            $googleUser->getEmail(),
            $googleUser->getName(),
        );
        $this->entityManager->flush();
        $this->loginUser($request, $user);

        return $this->redirectToRoute('account');
    }

    #[Route('/auth/vk', name: 'auth_vk_start')]
    public function vkStart(Request $request): Response
    {
        $clientId = $this->vkClientId();
        if ($clientId === '') {
            $this->addFlash('error', 'VK ID не настроен. Добавьте OAUTH_VK_ID в .env.local');

            return $this->redirectToRoute('account');
        }

        $verifier = bin2hex(random_bytes(32));
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        $state = bin2hex(random_bytes(16));

        $session = $request->getSession();
        $session->set('vk_code_verifier', $verifier);
        $session->set('vk_oauth_state', $state);

        $redirect = $this->generateUrl('auth_vk_callback', [], UrlGeneratorInterface::ABSOLUTE_URL);
        $url = sprintf(
            'https://id.vk.ru/authorize?response_type=code&client_id=%s&redirect_uri=%s&scope=%s&state=%s&code_challenge=%s&code_challenge_method=S256',
            urlencode($clientId),
            urlencode($redirect),
            urlencode('email'),
            urlencode($state),
            urlencode($challenge),
        );

        return $this->redirect($url);
    }

    #[Route('/auth/vk/callback', name: 'auth_vk_callback')]
    public function vkCallback(Request $request): Response
    {
        $code = $request->query->get('code');
        if (!is_string($code) || $code === '') {
            $error = $request->query->get('error_description', $request->query->get('error', 'не получен код'));
            $this->addFlash('error', 'VK: '.(is_string($error) ? $error : 'не получен код авторизации'));

            return $this->redirectToRoute('account');
        }

        $deviceId = $request->query->get('device_id');
        if (!is_string($deviceId) || $deviceId === '') {
            $this->addFlash('error', 'VK: не получен device_id. Попробуйте войти снова.');

            return $this->redirectToRoute('account');
        }

        $state = $request->query->get('state');
        $expectedState = $request->getSession()->get('vk_oauth_state');
        if (!is_string($state) || !is_string($expectedState) || !hash_equals($expectedState, $state)) {
            $this->addFlash('error', 'VK: проверка state не прошла. Попробуйте войти снова.');

            return $this->redirectToRoute('account');
        }

        $verifier = $request->getSession()->get('vk_code_verifier');
        if (!is_string($verifier) || $verifier === '') {
            $this->addFlash('error', 'VK: сессия истекла, попробуйте снова');

            return $this->redirectToRoute('account');
        }

        $clientId = $this->vkClientId();
        if ($clientId === '') {
            $this->addFlash('error', 'VK ID не настроен на сервере');

            return $this->redirectToRoute('account');
        }

        try {
            $token = $this->vkOAuth->exchangeCode(
                $code,
                $verifier,
                $this->generateUrl('auth_vk_callback', [], UrlGeneratorInterface::ABSOLUTE_URL),
                $clientId,
                $deviceId,
                $state,
                $this->vkServiceToken(),
            );
            $profile = $this->vkOAuth->fetchUser((string) $token['access_token'], $clientId);
            $vkUser = $profile['user'];
            $name = trim(sprintf(
                '%s %s',
                $vkUser['first_name'] ?? '',
                $vkUser['last_name'] ?? '',
            )) ?: null;

            $user = $this->users->findOrCreate(
                'vk',
                (string) $vkUser['user_id'],
                isset($vkUser['email']) ? (string) $vkUser['email'] : null,
                $name,
            );
            $this->entityManager->flush();
            $this->loginUser($request, $user);

            $session = $request->getSession();
            $session->remove('vk_code_verifier');
            $session->remove('vk_oauth_state');
        } catch (\Throwable $e) {
            $this->logger->error('VK OAuth callback failed', ['exception' => $e]);
            $this->addFlash('error', 'VK: не удалось войти. Проверьте ключи и тип приложения в кабинете VK ID.');

            return $this->redirectToRoute('account');
        }

        return $this->redirectToRoute('account');
    }

    private function loginUser(Request $request, User $user): void
    {
        $this->userAuthenticator->authenticateUser($user, $this->oauthAuthenticator, $request);
    }

    private function vkClientId(): string
    {
        return $_ENV['OAUTH_VK_ID'] ?? $_SERVER['OAUTH_VK_ID'] ?? '';
    }

    /**
     * Сервисный ключ для конфиденциального приложения (VK ID → Ключи доступа).
     */
    private function vkServiceToken(): ?string
    {
        $token = $_ENV['OAUTH_VK_SERVICE_TOKEN'] ?? $_SERVER['OAUTH_VK_SERVICE_TOKEN'] ?? null;

        return is_string($token) && $token !== '' ? $token : null;
    }
}
