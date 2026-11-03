"""Vlastný (self-signed) HTTPS certifikát. Mobilné prehliadače púšťajú gyroskop len cez HTTPS."""
import datetime
import ipaddress
import logging
import ssl

from .config import DATA

log = logging.getLogger("certs")
CERT = DATA / "cert.pem"
KEY = DATA / "key.pem"


def _cert_ips():
    from cryptography import x509
    try:
        cert = x509.load_pem_x509_certificate(CERT.read_bytes())
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        if cert.not_valid_after_utc < datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7):
            return set()
        return {str(ip) for ip in san.get_values_for_type(x509.IPAddress)}
    except (OSError, ValueError, x509.ExtensionNotFound):
        return set()


def _generate(ips):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Apex Telemetria")])
    now = datetime.datetime.now(datetime.timezone.utc)
    san = [x509.DNSName("localhost")] + [x509.IPAddress(ipaddress.ip_address(ip)) for ip in ips]
    cert = (x509.CertificateBuilder()
            .subject_name(name).issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=825))
            .add_extension(x509.SubjectAlternativeName(san), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .sign(key, hashes.SHA256()))
    DATA.mkdir(parents=True, exist_ok=True)
    KEY.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                      serialization.NoEncryption()))
    CERT.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    log.info("Vytvorený HTTPS certifikát pre %s", ", ".join(ips))


def ssl_context(lan_ips):
    """SSL kontext pre HTTPS server, alebo None ak chýba knižnica cryptography."""
    try:
        import cryptography  # noqa: F401
    except ImportError:
        log.warning("Chýba balík cryptography – volant (gyroskop) nebude cez HTTPS dostupný.")
        return None
    ips = sorted({"127.0.0.1", *lan_ips})
    # nový certifikát, ak sa zmenila IP adresa PC (mobil by inak hlásil nesprávnu adresu)
    if not CERT.exists() or not KEY.exists() or not set(ips) <= _cert_ips():
        _generate(ips)
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.load_cert_chain(CERT, KEY)
    return ctx
