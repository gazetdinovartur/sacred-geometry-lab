<?php

declare(strict_types=1);

namespace App\Twig;

use Twig\Extension\AbstractExtension;
use Twig\TwigFunction;

final class AppExtension extends AbstractExtension
{
    public function __construct(
        private readonly string $projectDir,
    ) {
    }

    public function getFunctions(): array
    {
        return [
            new TwigFunction('assets_built', $this->assetsBuilt(...)),
        ];
    }

    public function assetsBuilt(): bool
    {
        return is_file($this->projectDir.'/public/build/main.js')
            && is_file($this->projectDir.'/public/build/main.css');
    }
}
