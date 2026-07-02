<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\User;
use App\Repository\UserRepository;
use App\Security\OAuthAuthenticator;
use App\Service\VkIdOAuthService;
use Doctrine\ORM\EntityManagerInterface;
use KnpU\OAuth2ClientBundle\Client\ClientRegistry;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
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
        $clientId = $_ENV['OAUTH_VK_ID'] ?? '';
        if ($clientId === '') {
            $this->addFlash('error', 'VK ID не настроен. Добавьте OAUTH_VK_ID и OAUTH_VK_SECRET в .env.local');

            return $this->redirectToRoute('account');
        }

        $verifier = bin2hex(random_bytes(32));
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        $request->getSession()->set('vk_code_verifier', $verifier);

        $redirect = $request->getSchemeAndHost().$this->generateUrl('auth_vk_callback');
        $url = sprintf(
            'https://id.vk.com/authorize?response_type=code&client_id=%s&redirect_uri=%s&scope=email&state=vk&code_challenge=%s&code_challenge_method=S256',
            urlencode($clientId),
            urlencode($redirect),
            urlencode($challenge),
        );

        return $this->redirect($url);
    }

    #[Route('/auth/vk/callback', name: 'auth_vk_callback')]
    public function vkCallback(Request $request): Response
    {
        $code = $request->query->get('code');
        if (!is_string($code) || $code === '') {
            $this->addFlash('error', 'VK: не получен код авторизации');

            return $this->redirectToRoute('account');
        }

        $verifier = $request->getSession()->get('vk_code_verifier');
        if (!is_string($verifier) || $verifier === '') {
            $this->addFlash('error', 'VK: сессия истекла, попробуйте снова');

            return $this->redirectToRoute('account');
        }

        $clientId = $_ENV['OAUTH_VK_ID'] ?? '';
        $clientSecret = $_ENV['OAUTH_VK_SECRET'] ?? null;

        try {
            $token = $this->vkOAuth->exchangeCode(
                $code,
                $verifier,
                $request->getSchemeAndHost().$this->generateUrl('auth_vk_callback'),
                $clientId,
                is_string($clientSecret) ? $clientSecret : null,
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
            $request->getSession()->remove('vk_code_verifier');
        } catch (\Throwable $e) {
            $this->addFlash('error', 'VK: не удалось войти. Проверьте ключи в .env.local');

            return $this->redirectToRoute('account');
        }

        return $this->redirectToRoute('account');
    }

    private function loginUser(Request $request, User $user): void
    {
        $this->userAuthenticator->authenticateUser($user, $this->oauthAuthenticator, $request);
    }
}
