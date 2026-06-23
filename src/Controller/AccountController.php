<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\PatternRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class AccountController extends AbstractController
{
    #[Route('/account', name: 'account')]
    public function index(PatternRepository $patterns): Response
    {
        $user = $this->getUser();
        if (!$user instanceof \App\Entity\User) {
            return $this->render('account/login.html.twig');
        }

        return $this->render('account/index.html.twig', [
            'patterns' => $patterns->findByUserOrdered($user),
        ]);
    }

    #[Route('/account/logout', name: 'account_logout')]
    public function logout(): never
    {
        throw new \LogicException('Logout handled by firewall.');
    }
}
