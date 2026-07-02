<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class PageController extends AbstractController
{
    #[Route('/about', name: 'about')]
    public function about(): Response
    {
        return $this->render('pages/about.html.twig');
    }

    #[Route('/ethics', name: 'ethics')]
    public function ethics(): RedirectResponse
    {
        return new RedirectResponse($this->generateUrl('how').'#ethics', Response::HTTP_MOVED_PERMANENTLY);
    }

    #[Route('/privacy', name: 'privacy')]
    public function privacy(): Response
    {
        return $this->render('pages/privacy.html.twig');
    }

    #[Route('/how', name: 'how')]
    public function how(): Response
    {
        return $this->render('pages/how.html.twig');
    }
}
