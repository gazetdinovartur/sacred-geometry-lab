<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

final class PageTest extends WebTestCase
{
    protected function tearDown(): void
    {
        parent::tearDown();
        self::ensureKernelShutdown();
    }

    #[DataProvider('publicPagesProvider')]
    public function testPublicPageIsSuccessful(string $path, string $expectedFragment): void
    {
        $client = static::createClient();
        $client->request('GET', $path);

        self::assertResponseIsSuccessful();
        self::assertStringContainsString($expectedFragment, $client->getResponse()->getContent() ?: '');
    }

    public function testEthicsRedirectsToHow(): void
    {
        $client = static::createClient();
        $client->request('GET', '/ethics');

        self::assertResponseRedirects('/how#ethics', 301);
    }

    public function testHowPageContainsEthicsSection(): void
    {
        $client = static::createClient();
        $client->request('GET', '/how');

        self::assertResponseIsSuccessful();
        self::assertStringContainsString('Этика и конфиденциальность', $client->getResponse()->getContent() ?: '');
        self::assertStringContainsString('Сервис не хранит сказанные слова', $client->getResponse()->getContent() ?: '');
    }

    public function testUnknownRouteReturns404(): void
    {
        $client = static::createClient();
        $client->request('GET', '/nonexistent-route-xyz');

        self::assertResponseStatusCodeSame(404);
    }

    public function testLabRouteDoesNotExist(): void
    {
        $client = static::createClient();
        $client->request('GET', '/lab');

        self::assertResponseStatusCodeSame(404);
    }

    /**
     * @return iterable<string, array{0: string, 1: string}>
     */
    public static function publicPagesProvider(): iterable
    {
        yield 'home' => ['/', 'Как ты сейчас?'];
        yield 'about' => ['/about', 'О проекте'];
        yield 'how' => ['/how', 'Как это работает'];
        yield 'account login' => ['/account', 'Своё место'];
    }
}
