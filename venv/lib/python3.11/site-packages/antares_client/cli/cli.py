import click

import antares_client


@click.group()
@click.version_option(antares_client.__version__)
def entry_point():
    pass
